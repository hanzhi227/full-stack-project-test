import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { MAX_DOCUMENTS, MAX_FILE_BYTES, askRequestSchema } from '@document-qa/contracts';
import { ingestDocument, listDocuments } from './server/documents';
import { answerQuestion } from './server/agent';
import { AppError } from './server/errors';
import { workspaceRoute, sendApiError } from './server/http';
import { withWorkspaceLock } from './server/request-limits';
import { missingConfiguration } from './server/config';
const services = { ingestDocument, listDocuments, answerQuestion };
export function createApp(dependencies: typeof services = services) {
 const app = Fastify({ logger: false, requestTimeout: 120_000, bodyLimit: MAX_FILE_BYTES + 16_384 });
 app.register(cookie);
 app.addHook('onSend', async (_request, reply) => {
  reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').header('X-Frame-Options', 'DENY');
 });
 app.setErrorHandler((error, request, reply) => sendApiError(error, reply, request.id));
 app.addContentTypeParser(/^multipart\/form-data(?:;|$)/, { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
 app.get('/api/health', async (_request, reply) => {
  const missing = missingConfiguration();
  return reply.code(missing.length ? 503 : 200).send({ status: missing.length ? 'configuration_required' : 'configured', service: 'api', tracing: process.env.LANGSMITH_API_KEY ? 'configured' : 'disabled', providers: 'not_probed' });
 });
 app.get('/api/documents', (request, reply) => workspaceRoute(request, reply, 'list', async workspaceId => ({ body: { documents: await dependencies.listDocuments(workspaceId) } })));
 app.post('/api/documents', (request, reply) => workspaceRoute(request, reply, 'upload', workspaceId => withWorkspaceLock(workspaceId, async () => {
  if (!(request.body instanceof Buffer)) throw new AppError('INVALID_FILE', 'Choose a TXT or Markdown file.', 400, false);
  let form: FormData;
  try { form = await new Request('http://localhost/upload', { method: 'POST', headers: { 'Content-Type': request.headers['content-type']! }, body: new Blob([new Uint8Array(request.body)]) }).formData(); }
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
  if ((await dependencies.listDocuments(workspaceId)).length >= MAX_DOCUMENTS) throw new AppError('DOCUMENT_LIMIT', 'This session already has five documents.', 409, false);
  const document = await dependencies.ingestDocument({ workspaceId, name, text });
  return { status: 201, body: { document } };
 })));
 app.post('/api/ask', { bodyLimit: 64_000 }, (request, reply) => workspaceRoute(request, reply, 'ask', async (workspaceId, requestId) => {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new AppError('INVALID_REQUEST', 'Send the question as JSON.', 400, false);
  const input = askRequestSchema.parse(request.body);
  const owned = new Set((await dependencies.listDocuments(workspaceId)).map(document => document.id));
  if (input.documentIds.some(id => !owned.has(id))) throw new AppError('DOCUMENT_NOT_FOUND', 'Select documents available in this session.', 404, false);
  return { body: { ...await dependencies.answerQuestion({ workspaceId, ...input }), requestId } };
 }));
 return app;
}
