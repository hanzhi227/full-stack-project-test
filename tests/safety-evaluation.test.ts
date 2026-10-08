import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../apps/api/src/server/errors';
import { safetyCases, safetyPairs } from '../evals/safety-cases';
import { runSafetyEvaluation } from '../evals/safety-evaluation';
import { fixtureSafetyCases } from '../evals/fixture-safety-cases';

test('safety dataset has 20 distinct contrast pairs and 40 balanced labeled inputs', () => {
 assert.equal(safetyPairs.length, 20);
 assert.equal(safetyCases.length, 40);
 assert.equal(new Set(safetyCases.map(item => item.id)).size, 40);
 assert.equal(new Set(safetyCases.map(item => item.input)).size, 40);
 for (const pair of safetyPairs) {
  const cases = safetyCases.filter(item => item.pairId === pair.id);
  assert.deepEqual(cases.map(item => item.expected), ['blocked', 'safe']);
  assert.ok(cases.every(item => item.input.trim().length > 0));
 }
});

test('fixture-derived dataset has ten balanced distinct inputs per document and runs all forty', async () => {
 assert.equal(fixtureSafetyCases.length, 40);
 assert.equal(new Set(fixtureSafetyCases.map(item => item.id)).size, 40);
 assert.equal(new Set(fixtureSafetyCases.map(item => item.input)).size, 40);
 const fixtures = new Set(fixtureSafetyCases.map(item => item.fixture));
 assert.equal(fixtures.size, 4);
 for (const fixture of fixtures) {
  const cases = fixtureSafetyCases.filter(item => item.fixture === fixture);
  assert.equal(cases.length, 10);
  assert.equal(cases.filter(item => item.expected === 'safe').length, 5);
  assert.equal(cases.filter(item => item.expected === 'blocked').length, 5);
 }
 let index = 0;
 const report = await runSafetyEvaluation(async () => fixtureSafetyCases[index++].expected, fixtureSafetyCases);
 assert.equal(index, 40);
 assert.equal(report.passed, 40);
 assert.ok(report.results.every(item => item.fixture));
});

test('safety evaluation distinguishes unsafe passes, false blocks, and provider errors and continues', async () => {
 let index = 0;
 const report = await runSafetyEvaluation(async () => {
  const item = safetyCases[index++];
  if (index === 1) return 'safe';
  if (index === 2) return 'blocked';
  if (index === 3) throw new AppError('PROVIDER_UNAVAILABLE', 'Provider unavailable');
  return item.expected;
 });
 assert.equal(index, 40);
 assert.equal(report.total, 40);
 assert.equal(report.passed, 37);
 assert.equal(report.unsafeAllowed, 1);
 assert.equal(report.safeBlocked, 1);
 assert.equal(report.providerErrors, 1);
 assert.equal(report.results[2].errorCode, 'PROVIDER_UNAVAILABLE');
 assert.equal(report.results[2].pass, false);
 assert.ok(report.results.every(item => item.latencyMs >= 0));
});
