import { embedTexts, chatJson, decisionChoice } from '../apps/api/src/server/providers/openrouter';
import { z } from 'zod';
import { traceStage } from '../apps/api/src/server/tracing';
async function main() {
 const results: Record<string, unknown> = {};
 for (const [name, run] of Object.entries({
  embeddings: async () => ({ model: process.env.OPENROUTER_EMBEDDING_MODEL, dimensions: (await embedTexts(['Fictional handbook provider readiness check.']))[0].length }),
  chat: async () => ({ model: process.env.OPENROUTER_CHAT_MODEL, result: await chatJson({ name: 'readiness', schema: z.object({ ready: z.literal(true) }), messages: [{ role: 'system', content: 'Return only a JSON object: {"ready":true}.' },{ role: 'user', content: 'Readiness check.' }] }) }),
  decisions: async () => ({ model: process.env.OPENROUTER_DECISION_MODEL, result: await decisionChoice({ state: 'Readiness check.', instructions: 'Select ready.', criteria: { ready: 'The service is ready.' } }) }),
  tracing: async () => { if (!process.env.LANGSMITH_API_KEY) return { status: 'blocked', reason: 'LANGSMITH_API_KEY missing' }; await traceStage('provider-readiness', async () => ({ ready: true })); return { status: 'submitted' }; }
 })) {
  try { results[name] = { status: 'passed', ...await run() }; } catch(error) { results[name] = { status: 'failed', error: error instanceof Error ? error.message : 'Unknown failure' }; }
 }
 console.log(JSON.stringify(results, null, 2));
 if (Object.values(results).some(value => (value as { status: string }).status === 'failed')) process.exitCode = 1;
}
main();
