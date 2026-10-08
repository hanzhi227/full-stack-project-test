import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type {} from '@fastify/cookie';
import { ZodError } from 'zod';
import { AppError } from './errors';
import { SESSION_COOKIE, sessionCookieOptions, workspaceSession } from './session';
import { rateLimit } from './request-limits';
export function assertOrigin(request: Pick<Request, 'headers' | 'url'>) {
 const origin = request.headers.get('origin');
 const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
 if (!origin || origin !== expected) throw new AppError('INVALID_ORIGIN', 'This request must come from the application.', 403, false);
 if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('INVALID_ORIGIN', 'Cross-site requests are not allowed.', 403, false);
}
export function sendApiError(error: unknown, reply: FastifyReply, requestId: string) {
 const code = (error as { code?: string })?.code;
 const known = error instanceof AppError ? error
  : code === 'FST_ERR_CTP_BODY_TOO_LARGE' ? new AppError('REQUEST_TOO_LARGE', 'The request is too large.', 413, false)
  : error instanceof ZodError || error instanceof SyntaxError || code?.startsWith('FST_ERR_CTP_') ? new AppError('INVALID_REQUEST', 'Check the question, selected documents, and file, then try again.', 400, false)
  : new AppError('INTERNAL_ERROR', 'The request could not be completed. Try again.');
 if (known.code === 'INTERNAL_ERROR') console.error(JSON.stringify({ requestId, code: known.code }));
 return reply.code(known.status).send({ error: { code: known.code, message: known.message, retryable: known.retryable }, requestId });
}
export async function workspaceRoute(request: FastifyRequest, reply: FastifyReply, action: 'list' | 'upload' | 'ask', run: (workspaceId: string, requestId: string) => Promise<{ status?: number; body: unknown }>) {
 const requestId = randomUUID();
 try {
  if (action !== 'list') {
   const headers = new Headers();
   for (const key of ['origin', 'sec-fetch-site']) { const value = request.headers[key]; if (typeof value === 'string') headers.set(key, value); }
   assertOrigin({ headers, url: process.env.APP_ORIGIN ?? 'http://localhost:3000' });
  }
  const session = workspaceSession(request.cookies[SESSION_COOKIE]);
  // Invalid cookies must not bypass the workspace-creation limiter.
  if (session.cookie) rateLimit('new-workspace', 100);
  rateLimit(`${session.workspaceId}:${action}`, action === 'ask' ? 15 : action === 'upload' ? 5 : 60);
  if (session.cookie) reply.setCookie(SESSION_COOKIE, session.cookie, sessionCookieOptions);
  const result = await run(session.workspaceId, requestId);
  return reply.code(result.status ?? 200).send(result.body);
 } catch (error) { return sendApiError(error, reply, requestId); }
}
