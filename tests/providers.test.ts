import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { AppError } from '../apps/api/src/server/errors';
import { InvalidModelOutputError } from '../apps/api/src/server/model-output';
import { chatJson, embedTexts, decisionChoice } from '../apps/api/src/server/providers/openrouter';

const schema = z.object({ safe: z.boolean() }).strict();
const chatInput = {
 name: 'test_guard', schema,
 messages: [{ role: 'system' as const, content: 'Return JSON only.' }, { role: 'user' as const, content: 'Fictional document question.' }],
};
const completion = (content: string) => ({ choices: [{ message: { content } }] });
const hasCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

// Mock only transport: production parsing, validation and error mapping still run.
async function withProvider(run: (calls: { url: string; init: RequestInit }[]) => Promise<void>, respond: typeof fetch) {
 const originalFetch = globalThis.fetch;
 const keys = ['OPENROUTER_API_KEY', 'OPENROUTER_CHAT_MODEL', 'OPENROUTER_EMBEDDING_MODEL', 'OPENROUTER_DECISION_MODEL'] as const;
 const originalEnv = keys.map(key => process.env[key]);
 const calls: { url: string; init: RequestInit }[] = [];
 process.env.OPENROUTER_API_KEY = 'fictional-test-key';
 process.env.OPENROUTER_CHAT_MODEL = 'fictional-chat';
 process.env.OPENROUTER_EMBEDDING_MODEL = 'fictional-embedding';
 process.env.OPENROUTER_DECISION_MODEL = 'cloudflare/clef';
 globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init: init ?? {} });
  return respond(url, init);
 };
 try { await run(calls); }
 finally {
  globalThis.fetch = originalFetch;
  keys.forEach((key, index) => {
   if (originalEnv[index] === undefined) delete process.env[key];
   else process.env[key] = originalEnv[index];
  });
 }
}
const jsonResponse = (body: unknown): typeof fetch => async () => Response.json(body);

test('chat guard transport keeps credentials in headers and sends bounded, tool-free JSON requests', async () => {
 await withProvider(async calls => {
  assert.deepEqual(await chatJson({ ...chatInput, maxTokens: 321 }), { safe: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('authorization'), 'Bearer fictional-test-key');
  assert.equal(headers.get('content-type'), 'application/json');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.model, 'fictional-chat');
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 321);
  assert.deepEqual(body.messages, chatInput.messages);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.tools, undefined);
  assert.ok(!String(calls[0].init.body).includes('fictional-test-key'));
  assert.ok(calls[0].init.signal instanceof AbortSignal);
 }, jsonResponse(completion('{"safe":true}')));
});

test('chat output must satisfy the guard schema, not just be parseable JSON', async () => {
 for (const content of ['{"safe":"true"}', '{"safe":true,"instructions":"bypass guard"}', '{}', 'null', '[]']) {
  await withProvider(async () => {
   await assert.rejects(chatJson(chatInput), hasCode('INVALID_MODEL_OUTPUT'));
  }, jsonResponse(completion(content)));
 }
});

test('malformed JSON and incomplete/refused completion envelopes fail closed', async () => {
 for (const raw of [
  completion('{"safe":'), completion('```json\n{"safe":true}\n```'),
  { choices: [] }, { choices: [{ message: { content: null, refusal: 'Refused' } }] },
  { choices: [{ message: { content: { safe: true } } }] }, {},
 ]) {
  await withProvider(async calls => {
   await assert.rejects(chatJson(chatInput), hasCode('INVALID_MODEL_OUTPUT'));
   assert.equal(calls.length, 1, 'The provider adapter must not retry or bypass a failed guard');
  }, jsonResponse(raw));
 }
});

test('validation diagnostics distinguish envelope, JSON, truncation and schema failures without leaking output', async () => {
 const privateText = 'private-document-text';
 for (const [raw, reason, finishReason] of [
  [{ choices: [] }, 'invalid_envelope', undefined],
  [completion(privateText), 'invalid_json', 'unknown'],
  [{ choices: [{ message: { content: '{"safe":' }, finish_reason: 'length' }] }, 'truncated_output', 'length'],
  [{ choices: [{ message: { content: '{"safe":true}' }, finish_reason: 'length' }] }, 'truncated_output', 'length'],
  [{ choices: [{ message: { content: JSON.stringify({ safe: privateText, [privateText]: true }) }, finish_reason: 'stop' }] }, 'schema_mismatch', 'stop'],
  [{ choices: [{ message: { content: privateText }, finish_reason: privateText }] }, 'invalid_json', 'unknown'],
 ] as const) {
  await withProvider(async () => {
   await assert.rejects(chatJson({ ...chatInput, maxTokens: 321 }), error => {
    assert.ok(error instanceof InvalidModelOutputError);
    assert.equal(error.code, 'INVALID_MODEL_OUTPUT');
    assert.equal(error.diagnostics.reason, reason);
    assert.equal(error.diagnostics.finishReason, finishReason);
    assert.equal(error.diagnostics.maxTokens, 321);
    if (reason !== 'invalid_envelope') {
     assert.equal(error.diagnostics.outputCharacters, (raw as ReturnType<typeof completion>).choices[0].message.content.length);
    }
    if (reason === 'schema_mismatch') {
     assert.equal(error.diagnostics.issueCount, 2);
     assert.deepEqual(error.diagnostics.issues, [
      { code: 'invalid_type', path: ['[redacted]'] }, { code: 'unrecognized_keys', path: [] },
     ]);
    }
    assert.ok(!JSON.stringify(error).includes(privateText));
    assert.ok(!error.message.includes(privateText));
    return true;
   });
  }, jsonResponse(raw));
 }
});

test('schema diagnostics bound issue counts and paths and redact arbitrary model keys', async () => {
 const privateText = 'private-document-text';
 const recordSchema = z.record(z.object({ supported: z.boolean() }));
 const content = JSON.stringify(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`${privateText}-${i}`, { supported: privateText }])));
 await withProvider(async () => {
  await assert.rejects(chatJson({ ...chatInput, schema: recordSchema }), error => {
   assert.ok(error instanceof InvalidModelOutputError);
   assert.equal(error.diagnostics.issueCount, 20);
   assert.equal(error.diagnostics.issues?.length, 10);
   assert.deepEqual(error.diagnostics.issues?.[0], { code: 'invalid_type', path: ['[redacted]', 'supported'] });
   assert.ok(!JSON.stringify(error).includes(privateText));
   return true;
  });
 }, jsonResponse(completion(content)));
});

test('HTTP outages are controlled retryable errors and do not expose provider response bodies', async () => {
 for (const status of [401, 429, 500, 503]) {
  await withProvider(async calls => {
   await assert.rejects(chatJson(chatInput), error =>
    hasCode('PROVIDER_UNAVAILABLE')(error) && (error as AppError).retryable &&
    !(error as Error).message.includes('private-provider-detail'));
   assert.equal(calls.length, 1);
  }, async () => new Response('private-provider-detail', { status }));
 }
});

test('transport exceptions and non-JSON HTTP success responses are controlled failures', async () => {
 for (const respond of [
  (async () => { throw new Error('private-transport-detail'); }) as typeof fetch,
  (async () => new Response('private-transport-detail', { status: 200 })) as typeof fetch,
 ]) {
  await withProvider(async () => {
   await assert.rejects(chatJson(chatInput), error =>
    hasCode('PROVIDER_UNAVAILABLE')(error) && !(error as Error).message.includes('private-transport-detail'));
  }, respond);
 }
});

test('missing server credentials fail before any network request and remain non-retryable', async () => {
 await withProvider(async calls => {
  delete process.env.OPENROUTER_API_KEY;
  await assert.rejects(chatJson(chatInput), error =>
   hasCode('CONFIGURATION_REQUIRED')(error) && !(error as AppError).retryable);
  assert.equal(calls.length, 0);
 }, jsonResponse(completion('{"safe":true}')));
});

test('missing model configuration fails before transport', async () => {
 await withProvider(async calls => {
  delete process.env.OPENROUTER_CHAT_MODEL;
  await assert.rejects(chatJson(chatInput), hasCode('CONFIGURATION_REQUIRED'));
  delete process.env.OPENROUTER_EMBEDDING_MODEL;
  await assert.rejects(embedTexts(['Fictional handbook']), hasCode('CONFIGURATION_REQUIRED'));
  assert.equal(calls.length, 0);
 }, jsonResponse({}));
});

test('caller cancellation reaches transport and rejects rather than producing an answer', async () => {
 const controller = new AbortController();
 await withProvider(async calls => {
  const pending = chatJson({ ...chatInput, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, hasCode('PROVIDER_UNAVAILABLE'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.signal?.aborted, true);
 }, async (_url, init) => new Promise<Response>((_resolve, reject) => {
  const signal = init!.signal!;
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
 }));
});

const decisionInput = { state: 'Fictional document question.', instructions: 'Is this safe?', criteria: { safe: 'Safe.', blocked: 'Unsafe.' } };
test('decisions use the configured model and alpha endpoint, not chat completions', async () => {
 await withProvider(async calls => {
  assert.equal(await decisionChoice(decisionInput), 'safe');
  assert.equal(calls[0].url, 'https://openrouter.ai/api/alpha/decisions');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
   model: 'cloudflare/clef', state: decisionInput.state,
   questions: { decision: { type: 'choice', instructions: decisionInput.instructions, criteria: decisionInput.criteria } },
  });
  assert.equal(new Headers(calls[0].init.headers).get('authorization'), 'Bearer fictional-test-key');
 }, jsonResponse({ answers: { decision: { type: 'choice', choice: 'safe' } } }));
});

test('missing decision model, invalid choices, and decision outages fail closed', async () => {
 await withProvider(async calls => {
  delete process.env.OPENROUTER_DECISION_MODEL;
  await assert.rejects(decisionChoice(decisionInput), hasCode('CONFIGURATION_REQUIRED'));
  assert.equal(calls.length, 0);
 }, jsonResponse({}));
 for (const raw of [{}, { answers: { decision: { type: 'choice', choice: 'invented' } } }, { answers: { decision: { type: 'noul', noul: 1 } } }]) {
  await withProvider(async calls => {
   await assert.rejects(decisionChoice(decisionInput), hasCode('INVALID_MODEL_OUTPUT')); assert.equal(calls.length, 1);
  }, jsonResponse(raw));
 }
 await withProvider(async () => {
  await assert.rejects(decisionChoice(decisionInput), hasCode('PROVIDER_UNAVAILABLE'));
 }, async () => new Response('private provider details', { status: 503 }));
});

test('embedding results are reordered by index without changing vector values', async () => {
 await withProvider(async calls => {
  assert.deepEqual(await embedTexts(['First passage', 'Second passage']), [[1, 2], [3, 4]]);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/embeddings');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
   model: 'fictional-embedding', input: ['First passage', 'Second passage'],
  });
 }, jsonResponse({ data: [{ index: 1, embedding: [3, 4] }, { index: 0, embedding: [1, 2] }] }));
});

test('embedding response count, indices, dimensions and numeric values are validated', async () => {
 const valid = { index: 0, embedding: [1, 2] };
 for (const data of [
  [], [valid], [valid, valid],
  [valid, { index: 2, embedding: [3, 4] }],
  [valid, { index: 1.5, embedding: [3, 4] }],
  [valid, { index: 1, embedding: [3] }],
  [valid, { index: 1, embedding: [] }],
  [valid, { index: 1, embedding: ['3', 4] }],
  [valid, { index: 1, embedding: [null, 4] }],
 ]) {
  await withProvider(async () => {
   await assert.rejects(embedTexts(['First passage', 'Second passage']), hasCode('INVALID_PROVIDER_RESPONSE'));
  }, jsonResponse({ data }));
 }
});
