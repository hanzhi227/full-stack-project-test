import { NextRequest, NextResponse } from 'next/server';
import { MAX_DOCUMENTS, MAX_FILE_BYTES } from '@/contracts';
import { ingestDocument, listDocuments } from '@/server/documents';
import { AppError } from '@/server/errors';
import { boundedBody, workspaceRoute } from '@/server/http';
import { withWorkspaceLock } from '@/server/request-limits';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET(request: NextRequest) {
 return workspaceRoute(request, 'list', async workspaceId => NextResponse.json({ documents: await listDocuments(workspaceId) }));
}
export async function POST(request: NextRequest) {
 return workspaceRoute(request, 'upload', workspaceId => withWorkspaceLock(workspaceId, async () => {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new AppError('INVALID_FILE', 'Choose a TXT or Markdown file.', 400, false);
  const body = await boundedBody(request, MAX_FILE_BYTES + 16_384);
  let form: FormData;
  try { form = await new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type')! }, body: new Blob([Buffer.from(body)]) }).formData(); }
  catch { throw new AppError('INVALID_FILE', 'The upload could not be read. Choose a file and try again.', 400, false); }
  const entries = [...form.entries()]; const file = form.get('file');
  if (entries.length !== 1 || !(file instanceof File) || !/\.(txt|md)$/i.test(file.name)) throw new AppError('INVALID_FILE', 'Choose one TXT or Markdown file.', 400, false);
  if (file.size > MAX_FILE_BYTES) throw new AppError('FILE_TOO_LARGE', 'Files must be no larger than 1 MB.', 413, false);
  const name = file.name.normalize('NFC').replace(/[\x00-\x1f\x7f/\\]/g, '_');
  if (name.length > 200) throw new AppError('INVALID_FILE', 'The filename must be no longer than 200 characters.', 400, false);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new AppError('INVALID_ENCODING', 'Save the document as UTF-8 text and try again.', 400, false); }
  if (!text.trim() || text.includes('\0')) throw new AppError('EMPTY_DOCUMENT', 'Choose a non-empty text document.', 400, false);
  if ((await listDocuments(workspaceId)).length >= MAX_DOCUMENTS) throw new AppError('DOCUMENT_LIMIT', 'This session already has five documents.', 409, false);
  const document = await ingestDocument({ workspaceId, name, text });
  return NextResponse.json({ document }, { status: 201 });
 }));
}
