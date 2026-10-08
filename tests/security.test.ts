import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { signSession, verifySession } from '../src/server/session';
import { rateLimit, withWorkspaceLock } from '../src/server/request-limits';
import { assertOrigin, boundedBody } from '../src/server/http';
import { askRequestSchema } from '../src/contracts';
const secret = 'test-session-key-not-for-production'.repeat(2);
test('signed workspace cookie rejects tampering, expiry and wrong key', () => {
 const id = randomUUID(), now = 1_780_000_000_000;
 const cookie = signSession(id, now, secret);
 assert.equal(verifySession(cookie, now, secret), id);
 assert.equal(verifySession(cookie.replace(id, randomUUID()), now, secret), null);
 assert.equal(verifySession(cookie, now, secret+'x'), null);
 assert.equal(verifySession(cookie, now+7*86400*1000, secret), null);
 assert.equal(verifySession(cookie, now-1000, secret), null);
});
test('origin checks reject absent/cross-site mutation', () => {
 assert.throws(() => assertOrigin(new Request('http://localhost:3000/api/ask')));
 assert.throws(() => assertOrigin(new Request('http://localhost:3000/api/ask', { headers: { origin: 'https://evil.example' } })));
 assert.doesNotThrow(() => assertOrigin(new Request('http://localhost:3000/api/ask', { headers: { origin: 'http://localhost:3000' } })));
});
test('schema refuses caller-supplied workspace and oversized history', () => {
 const valid = {question:'Policy?', documentIds:[randomUUID()],history:[]};
 assert.ok(askRequestSchema.safeParse(valid).success);
 assert.ok(!askRequestSchema.safeParse({...valid,workspaceId:randomUUID()}).success);
 assert.ok(!askRequestSchema.safeParse({...valid,history:Array.from({length:7},()=>({role:'user',content:'Hi'}))}).success);
});
test('body limit applies without content-length', async () => {
 await assert.rejects(boundedBody(new Request('http://localhost', { method:'POST', body:'abcdef' }), 5));
 assert.equal(new TextDecoder().decode(await boundedBody(new Request('http://localhost', {method:'POST',body:'abc'}),3)), 'abc');
});
test('limiter expires and lock prevents simultaneous indexing', async () => {
 const key = randomUUID(); rateLimit(key,1,1000); assert.throws(()=>rateLimit(key,1,1001)); rateLimit(key,1,61_000);
 let release!:()=>void; const id=randomUUID();
 const first=withWorkspaceLock(id,()=>new Promise<void>(resolve=>{release=resolve;}));
 await assert.rejects(withWorkspaceLock(id,async()=>{})); release(); await first;
 await withWorkspaceLock(id,async()=>{});
});
