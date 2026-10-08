import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './config';
export const SESSION_COOKIE = 'document_qa_workspace';
const TTL_SECONDS = 7 * 24 * 60 * 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function signature(payload: string, secret: string) { return createHmac('sha256', secret).update(payload).digest('base64url'); }
export function signSession(workspaceId: string, now = Date.now(), secret = requiredEnv('SESSION_SIGNING_SECRET')): string {
 if (secret.length < 32) throw new Error('SESSION_SIGNING_SECRET must be at least 32 characters.');
 const payload = `${workspaceId}.${Math.floor(now / 1000)}`;
 return `${payload}.${signature(payload, secret)}`;
}
export function verifySession(cookie: string | undefined, now = Date.now(), secret = requiredEnv('SESSION_SIGNING_SECRET')): string | null {
 if (!cookie || cookie.length > 200 || secret.length < 32) return null;
 const parts = cookie.split('.');
 if (parts.length !== 3 || !uuid.test(parts[0]) || !/^\d{10}$/.test(parts[1])) return null;
 const issuedAt = Number(parts[1]);
 const age = Math.floor(now / 1000) - issuedAt;
 if (age < 0 || age >= TTL_SECONDS) return null;
 const expected = Buffer.from(signature(`${parts[0]}.${parts[1]}`, secret));
 const supplied = Buffer.from(parts[2]);
 return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? parts[0] : null;
}
export function workspaceSession(cookie?: string) {
 const existing = verifySession(cookie);
 return existing ? { workspaceId: existing, cookie: null } : (() => { const workspaceId = randomUUID(); return { workspaceId, cookie: signSession(workspaceId) }; })();
}
export const sessionCookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: TTL_SECONDS };
