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
- User confirmed the two-service Next.js/Fastify architecture. Migration and private routing are implemented; original reviewed services and contracts are preserved.
- LangSmith key remains missing; no live browser/eval/deployment acceptance claimed at component handoff.

## Worktree integration — 2026-10-08
- User requested stitching the worktrees together. Cherry-picked data `5e30605`, agent `0665061`, UI `703a6b0`, and focused fixes `580224a` / `57afc6b` into main without conflicts. Existing main changes were preserved.
- Kept the existing Next.js runtime for this integration; the separate Fastify/Railway architecture in BUILD_PLAN.md is not implemented by these commits.
- Included the 14 UI tests in `npm test`; all 77 combined tests pass. Typecheck and production build pass.
- Localhost:3000 serves the workspace controls rather than the placeholder. Live API upload and all eight eval cases passed against real providers and vector storage, including cross-session rejection. Report: `evals/latest.json` (ignored generated artifact).
- Corrected an eval-only false failure: line-span checks must preserve trailing newlines and CRLF in exact source excerpts. Two regression tests cover this.
- Eval fixture workspaces remain in the collection; no existing user documents or collections were deleted.

## Two-service integration — 2026-10-08
- Migrated to npm workspaces: `apps/web` for Next UI/proxy, `apps/api` for Fastify and existing server modules, `packages/contracts` for shared compiled schemas/types.
- API binds `::`; shared contracts/API compile to CommonJS. Per-service build/start commands now match the existing Railway setup.
- 80 tests, all typechecks, both production builds and dependency audit passed. Four Fastify integration tests cover cookie/ownership, malformed input/origin, actual payload limits/UTF-8, and controlled guard outage.
- Fresh independent migration review found no source issues (OK with notes); deployment validation remains separate.
- Real two-service local proxy (`localhost:3100` → API `localhost:4000`) passed 8/8 live evals. Parent inspected the answers/excerpts: approval plus receipt, 30-day filing window, honest absent-fact abstention, clarification, injection/fabrication handling and foreign-session denial were correct for the fictional handbook.
- Local Playwright passed real upload/answer/exact source, keyboard focus/disclosure, desktop/mobile/no overflow, refresh persistence, cookie flags, cross-session API denial, simulated guard-outage input preservation followed by live retry/abstention, and reset preserving documents. Valid screenshots were inspected at 1440px and 390px; no layout defects found.
- Browser download timed out; validation used an existing installed Chromium headless executable via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. No browser success was claimed for the failed download.
- Railway services `web`/`api` and API credentials verified. API has `NODE_ENV=production`, `PORT=4000`, correct `APP_ORIGIN`, compatible `document_chunks_v1`. Frontend `BACKEND_URL` matches actual private API DNS.
- First deployed migration build succeeded, but web runtime chose port8080 while the public domain targets3000. Set web `PORT=3000`. A newer GitHub deployment is applying that setting; an immediate redeploy request was refused because a newer build was active.
- Another session is committing independent hero/UI assets in this checkout. Those changes are preserved; this integration does not redesign or claim acceptance of that separate surface.
- Public `web` and proxied API health checks now pass. Active web container listens on3000 after applying PORT; private API listens on4000.
- Cloud eval run: 7/8 passed; paraphrase returned controlled retryable `GUARD_UNAVAILABLE` (no unchecked answer). One bounded paraphrase-only rerun passed with the correct 30-day answer and exact source. Initial failure remains recorded in `evals/latest.json`; do not label the initial run 8/8 or claim the intermittent failure is resolved.
- Cloud Playwright passed the same end-to-end/browser checks, including Secure/HTTP-only/SameSite=Lax cookies, source expansion, refresh, session isolation, simulated outage recovery and live abstention. Screenshots at desktop1440/mobile390 were inspected locally; cloud captures preserve the same surface.
- Added stage/code-only guard error diagnostics without logging questions, documents, credentials or raw provider errors. Existing behavior still fails closed; latest API build and 30 focused agent/API tests pass. This diagnostic change does not retroactively identify the original cloud guard failure.
- No secrets found in 10 built browser JS assets; root .env remains ignored/untracked. UI detector returned no findings for the existing workspace.
- Another session is actively rewriting the workspace UI. The final combined source typecheck hit stale generated `/hero` route types after that session removed the route; no unrelated UI source/tests were edited to hide it. Acceptance here is scoped to the deployed tested workspace; the in-progress redesign requires its own fresh build/typecheck/browser checks.
- LangSmith tracing remains blocked by the missing API key. No live tracing/experiment ID is claimed.
