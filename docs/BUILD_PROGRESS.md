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
