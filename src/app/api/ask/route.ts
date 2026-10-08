import { NextRequest, NextResponse } from 'next/server';
import { askRequestSchema } from '@/contracts';
import { answerQuestion } from '@/server/agent';
import { listDocuments } from '@/server/documents';
import { AppError } from '@/server/errors';
import { boundedBody, workspaceRoute } from '@/server/http';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: NextRequest) {
 return workspaceRoute(request, 'ask', async (workspaceId, requestId) => {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('INVALID_REQUEST', 'Send the question as JSON.', 400, false);
  const bytes = await boundedBody(request, 64_000);
  const input = askRequestSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  const owned = new Set((await listDocuments(workspaceId)).map(document => document.id));
  if (input.documentIds.some(id => !owned.has(id))) throw new AppError('DOCUMENT_NOT_FOUND', 'Select documents available in this session.', 404, false);
  const answer = await answerQuestion({ workspaceId, ...input });
  return NextResponse.json({ ...answer, requestId });
 });
}
