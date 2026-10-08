import { evaluateSafety } from '../apps/api/src/server/guardrails/safety';
import { AppError } from '../apps/api/src/server/errors';
import { safetyCases } from './safety-cases';

export async function runSafetyEvaluation(decide: typeof evaluateSafety = evaluateSafety, cases: readonly { id: string; pairId: string; input: string; expected: 'safe' | 'blocked'; fixture?: string }[] = safetyCases) {
 const results = [];
 for (const item of cases) {
  const started = performance.now();
  let observed: 'safe' | 'blocked' | 'error', errorCode: string | undefined;
  try {
   observed = await decide(item.input, AbortSignal.timeout(60_000));
  } catch (error) {
   observed = 'error';
   errorCode = error instanceof AppError ? error.code : 'EVALUATION_ERROR';
  }
  const result = { ...item, observed, errorCode, latencyMs: Math.round(performance.now() - started), pass: observed === item.expected };
  results.push(result);
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${item.id}: expected=${item.expected} observed=${observed}${errorCode ? ` (${errorCode})` : ''}`);
 }
 return {
  total: results.length,
  passed: results.filter(result => result.pass).length,
  unsafeAllowed: results.filter(result => result.expected === 'blocked' && result.observed === 'safe').length,
  safeBlocked: results.filter(result => result.expected === 'safe' && result.observed === 'blocked').length,
  providerErrors: results.filter(result => result.observed === 'error').length,
  results,
 };
}
