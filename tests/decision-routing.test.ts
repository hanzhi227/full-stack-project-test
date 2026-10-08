import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerQuestion } from '../apps/api/src/server/agent';
import { evaluateSafety } from '../apps/api/src/server/guardrails/safety';
import { chatJson } from '../apps/api/src/server/providers/openrouter';

// Mock transport only so the production agent, guards and model selection all run.
test('agent routes input/output safety to Clef and answer generation to the chat model', async () => {
 const documentId = 'a7a36b19-80e3-466b-9a7d-112fcf107147';
 const passage = { id: 'handbook-1', documentId, documentName: 'Handbook.md', excerpt: 'Attach a receipt.', startLine: 1, endLine: 1 };
 const keys = ['OPENROUTER_API_KEY', 'OPENROUTER_CHAT_MODEL', 'OPENROUTER_DECISION_MODEL'] as const;
 const originalEnv = keys.map(key => process.env[key]);
 const originalFetch = globalThis.fetch;
 const calls: { url: string; body: any }[] = [];
 process.env.OPENROUTER_API_KEY = 'fictional-key';
 process.env.OPENROUTER_CHAT_MODEL = 'fictional-chat';
 process.env.OPENROUTER_DECISION_MODEL = 'cloudflare/clef';
 globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
  return String(url).endsWith('/alpha/decisions')
   ? Response.json({ answers: { decision: { type: 'choice', choice: 'safe' } } })
   : Response.json({ choices: [{ message: { content: JSON.stringify({ status: 'answered', answer: passage.excerpt, citationIds: [passage.id] }) } }] });
 };
 try {
  const answer = createAnswerQuestion({ chatJson, evaluateSafety, retrieve: async () => [passage], traceStage: async (_name, run) => run() });
  const result = await answer({ workspaceId: 'verified-workspace', question: 'What do I attach?', documentIds: [documentId], history: [] });
  assert.equal(result.status, 'answered');
  assert.deepEqual(result.citations, [passage]);
  assert.deepEqual(calls.map(call => call.url), [
   'https://openrouter.ai/api/alpha/decisions',
   'https://openrouter.ai/api/v1/chat/completions',
   'https://openrouter.ai/api/alpha/decisions',
  ]);
  assert.deepEqual(calls.map(call => call.body.model), ['cloudflare/clef', 'fictional-chat', 'cloudflare/clef']);
  assert.equal(calls[0].body.state, 'What do I attach?');
  assert.equal(calls[2].body.state, passage.excerpt);
  for (const call of [calls[0], calls[2]]) {
   assert.equal(call.body.questions.decision.type, 'choice');
   assert.deepEqual(Object.keys(call.body.questions.decision.criteria), ['safe', 'blocked']);
   assert.equal(call.body.messages, undefined);
  }
 } finally {
  globalThis.fetch = originalFetch;
  keys.forEach((key, index) => {
   if (originalEnv[index] === undefined) delete process.env[key];
   else process.env[key] = originalEnv[index];
  });
 }
});
