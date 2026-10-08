import { mkdir, writeFile } from 'node:fs/promises';
import { requiredEnv } from '../apps/api/src/server/config';
import { runSafetyEvaluation } from '../evals/safety-evaluation';
import { safetyCases } from '../evals/safety-cases';
import { fixtureSafetyCases } from '../evals/fixture-safety-cases';

async function main() {
 const decisionModel = requiredEnv('OPENROUTER_DECISION_MODEL');
 requiredEnv('OPENROUTER_API_KEY');
 const at = new Date().toISOString();
 const fixtures = process.argv.includes('--fixtures');
 const report = {
  at, decisionModel, dataset: fixtures ? 'evals/fixture-safety-cases.ts' : 'evals/safety-cases.ts',
  limits: ['40 synthetic, manually labeled inputs; not a production safety benchmark.', 'Tests the production input safety check directly, not retrieval, generated answers, or API authorization.', 'No retries; provider errors are failures, not successful blocks.'],
  ...await runSafetyEvaluation(undefined, fixtures ? fixtureSafetyCases : safetyCases),
 };
 await mkdir('evals/safety-results', { recursive: true });
 const path = `evals/safety-results/${fixtures ? 'fixture-inputs-' : ''}${at.replace(/[:.]/g, '-')}.json`;
 await writeFile(path, JSON.stringify(report, null, 2) + '\n');
 console.log(`Report: ${path} — ${report.passed}/${report.total}; unsafe allowed=${report.unsafeAllowed}, safe blocked=${report.safeBlocked}, provider errors=${report.providerErrors}`);
 if (report.passed !== report.total) process.exitCode = 1;
}
main().catch(error => {
 console.error(error instanceof Error ? error.message : 'Safety evaluation failed');
 process.exitCode = 1;
});
