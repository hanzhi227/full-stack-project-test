import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './errors';
import { SESSION_COOKIE, sessionCookieOptions, workspaceSession } from './session';
import { rateLimit } from './request-limits';
export function assertOrigin(request: Request) {
 const origin = request.headers.get('origin');
 const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
 if (!origin || origin !== expected) throw new AppError('INVALID_ORIGIN', 'This request must come from the application.', 403, false);
 if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('INVALID_ORIGIN', 'Cross-site requests are not allowed.', 403, false);
}
export async function boundedBody(request: Request, max: number): Promise<Uint8Array> {
 const declared = request.headers.get('content-length');
 if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) throw new AppError('REQUEST_TOO_LARGE', 'The request is too large.', 413, false);
 const reader = request.body?.getReader();
 if (!reader) throw new AppError('INVALID_REQUEST', 'The request body is empty.', 400, false);
 const pieces: Uint8Array[] = []; let size = 0;
 try {
  for (;;) {
   const { value, done } = await reader.read(); if (done) break;
   size += value.byteLength;
   if (size > max) { await reader.cancel(); throw new AppError('REQUEST_TOO_LARGE', 'The request is too large.', 413, false); }
   pieces.push(value);
  }
 } finally { reader.releaseLock(); }
 const bytes = new Uint8Array(size); let offset = 0;
 for (const piece of pieces) { bytes.set(piece, offset); offset += piece.byteLength; }
 return bytes;
}
export async function workspaceRoute(request: NextRequest, action: 'list' | 'upload' | 'ask', run: (workspaceId: string, requestId: string) => Promise<NextResponse>) {
 const requestId = randomUUID();
 let session: ReturnType<typeof workspaceSession> | undefined;
 try {
  if (action !== 'list') assertOrigin(request);
  // Bound session creation as well as authenticated work; no raw IPs are stored.
  if (!request.cookies.get(SESSION_COOKIE)) rateLimit('new-workspace', 100);
  session = workspaceSession(request.cookies.get(SESSION_COOKIE)?.value);
  rateLimit(`${session.workspaceId}:${action}`, action === 'ask' ? 15 : action === 'upload' ? 5 : 60);
  const response = await run(session.workspaceId, requestId);
  response.headers.set('Cache-Control', 'no-store');
  if (session.cookie) response.cookies.set(SESSION_COOKIE, session.cookie, sessionCookieOptions);
  return response;
 } catch (error) {
  const known = error instanceof AppError ? error : error instanceof ZodError || error instanceof SyntaxError ? new AppError('INVALID_REQUEST', 'Check the question, selected documents, and file, then try again.', 400, false) : new AppError('INTERNAL_ERROR', 'The request could not be completed. Try again.');
  if (!(error instanceof AppError) && !(error instanceof ZodError) && !(error instanceof SyntaxError)) console.error(JSON.stringify({ requestId, code: known.code }));
  const response = NextResponse.json({ error: { code: known.code, message: known.message, retryable: known.retryable }, requestId }, { status: known.status, headers: { 'Cache-Control': 'no-store' } });
  if (session?.cookie) response.cookies.set(SESSION_COOKIE, session.cookie, sessionCookieOptions);
  return response;
 }
}
