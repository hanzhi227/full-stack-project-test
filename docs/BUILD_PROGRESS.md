# Build progress

## Foundation
- Next.js/TypeScript scaffold and shared contracts frozen.
- Live OpenRouter checks passed: `qwen/qwen3-embedding-8b` emits 4096 dimensions; `deepseek/deepseek-v4.1-flash` returns schema-valid JSON.
- LangSmith submission blocked: no `LANGSMITH_API_KEY`.
- Dependency audit: zero vulnerabilities after updating shared dependencies.

## Implementation topology: multi-seam
Independent contracts: browser API consumer, vector storage/retrieval, guarded answer service. Parent owns routes, security, provider adapters, contracts, dependencies, evals and integration.

| Lane | CWD / isolation | Decision and exclusive files | Authority | Gate / durable handoff | Independence |
| --- | --- | --- | --- | --- | --- |
| UI | ../full-stack-project-ui | Screen; src/components/, src/app/page.tsx, src/app/globals.css | Local edits/commit; no dependencies or publishing | Typecheck + fresh source review; lane commit | Consumes API client only |
| Data | ../full-stack-project-data | src/server/documents/, src/server/retrieval/, scripts/setup-vector-store.ts, tests/data.test.ts | Local edits/commit; create collection only if absent; never drop existing collection | Unit tests + isolated live insert/search/delete + fresh review; lane commit | Consumes embedding adapter, exports ingest/list/retrieve |
| Agent | ../full-stack-project-agent | src/server/agent/, src/server/guardrails/, tests/agent.test.ts | Local edits/commit; no publishing | Fixture guards/grounding tests + fresh review; lane commit | Consumes retrieve/chatJson contracts |
| Integration | main checkout | Shared foundation, routes/session, evals, documentation | Parent only | Integrated typecheck/build/tests/live browser + evals | Starts lane integration after committed handoffs |

All lanes must return paths, checks actually run, open decisions and limits. Parent reviews diffs and integrates. Never send secrets to reports.

## Component review and focused fixes
- UI commit `703a6b0`: fresh source review OK with notes; browser checks pending.
- Data commit `5e30605`: 18 unit tests and live hybrid insert/search/isolation/delete passed. Accepted P2: remove fallible redundant query after acknowledged readiness commit; focused regression required.
- Agent commit `0665061`: 24 tests passed. Accepted P1: grounding must see all retrieved passages to catch omitted qualifications, while support IDs must remain draft-cited. Two-passage regression required.
- Data fix `580224a`: focused reviewer OK; parent reran typecheck and 20/20 tests successfully.
- Agent fix `57afc6b`: focused reviewer OK with notes; parent reran typecheck and 26/26 tests successfully. Live grounding accuracy remains unverified.
- Fix runs `ff8397ab` and `bb0e260d` ended with infrastructure error `Output path changed after it was claimed` after commits/tests completed. Parent verified both tracked worktrees and staging indexes are clean (only pre-existing node_modules links untracked), recovered saved handoffs, inspected diffs, and obtained completed fresh review verdicts. Runs remain recorded as failed; no writer rerun or execution-mode fallback was used.
- All component writers/reviewers are terminal. Commits and durable handoffs are preserved in isolated worktrees for later integration; no worktree cleanup yet.
- Integration blocked pending confirmation: main BUILD_PLAN.md changed externally to separate Next.js/Fastify services. Do not overwrite that plan or migrate without confirmation.
- LangSmith key remains missing; no live browser/eval/deployment acceptance claimed at component handoff.

## Worktree integration — 2026-10-08
- User requested stitching the worktrees together. Cherry-picked data `5e30605`, agent `0665061`, UI `703a6b0`, and focused fixes `580224a` / `57afc6b` into main without conflicts. Existing main changes were preserved.
- Kept the existing Next.js runtime for this integration; the separate Fastify/Railway architecture in BUILD_PLAN.md is not implemented by these commits.
- Included the 14 UI tests in `npm test`; all 77 combined tests pass. Typecheck and production build pass.
- Localhost:3000 serves the workspace controls rather than the placeholder. Live API upload and all eight eval cases passed against real providers and vector storage, including cross-session rejection. Report: `evals/latest.json` (ignored generated artifact).
- Corrected an eval-only false failure: line-span checks must preserve trailing newlines and CRLF in exact source excerpts. Two regression tests cover this.
- Remaining checks: interactive browser/mobile/keyboard verification, independent grounding review, LangSmith tracing, and cloud deployment. Eval fixture workspaces remain in the collection; no existing user documents or collections were deleted.
