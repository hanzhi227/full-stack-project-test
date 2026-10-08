# Ask your documents

Two services: a Next.js workspace and a private Fastify API. Upload fictional UTF-8 TXT/Markdown guides, ask questions, and open the exact passages behind each answer.

## Local setup

Use Node.js 22 and npm. Credentials stay in the ignored root `.env`.

```sh
npm ci
cp .env.example .env  # Fill credentials; don't overwrite an existing .env.
npm run build --workspace @document-qa/contracts
npm run setup:vectors -- --verify
```

Run in separate terminals:

```sh
npm run dev:api       # http://localhost:4000
npm run dev:web       # http://localhost:3000
```

`APP_ORIGIN=http://localhost:3000`, `BACKEND_URL=http://localhost:4000`, and `API_PORT=4000` are the local defaults. API and frontend configuration explicitly load the root `.env`. Browser requests use relative `/api/...` URLs; Next.js forwards them to Fastify. Changing `BACKEND_URL` requires a frontend rebuild.

```sh
npm run typecheck
npm test
npm run build
npm run eval                 # Both services must be running; real provider calls.
npx playwright install chromium
npm run test:browser         # Real browser upload/Q&A; also tests a simulated outage.
```

Set `EVAL_BASE_URL` to test another frontend origin. The API's `APP_ORIGIN` must match. Evaluation/browser checks create only fictional documents in disposable workspaces; those documents remain indexed. No public deletion endpoint is shipped.

## Railway

Existing project: `glorious-spontaneity`. Both services use this repository's **root** as their root directory and the main branch. Shared `railway.json` selects Railpack; per-service build/start/health settings are configured in Railway.

| Setting | `web` | `api` |
| --- | --- | --- |
| Build | `npm ci && npm run build --workspace @document-qa/web` | `npm ci && npm run build --workspace @document-qa/api` |
| Start | `npm run start --workspace @document-qa/web` | `npm run start --workspace @document-qa/api` |
| Port | `PORT=3000` | `PORT=4000` |
| Health | `/health` | `/api/health` |
| Routing | `BACKEND_URL=http://full-stack-project-test.railway.internal:4000` | Listen on `::` for private networking |

Frontend: https://web-production-8c2080.up.railway.app

API-only variables: OpenRouter key/models, Zilliz endpoint/token/collection, session signing secret (at least 32 characters), optional LangSmith key/project, **`NODE_ENV=production`**, and **`APP_ORIGIN=https://web-production-8c2080.up.railway.app`**. No provider credentials belong on `web` or in `NEXT_PUBLIC_` variables. The configured API private hostname retained its original name when the service was renamed.

Use **one API replica**: rate limits and workspace admission locks are process-local. Configure shared locking/limits before scaling. Keep `apps/<service>/**`, `packages/contracts/**`, `package*.json`, and `railway.json` in that service's watch paths (or leave watch paths unrestricted).

Health endpoints report application/configuration readiness, not live provider connectivity. Use `npm run check:providers` and `npm run setup:vectors -- --verify` for actual provider checks. Set up vectors outside request handling.

## Code paths

- `apps/web/src/components/`: responsive workspace, upload/select, bounded history, source disclosures.
- `packages/contracts/src/`: shared types and validation; compiled once for both runtimes.
- `apps/api/src/app.ts`: Fastify routes, actual body limits, file validation, ownership and controlled errors.
- `apps/api/src/server/session.ts`: HMAC-signed HTTP-only workspace cookie; Secure in production, SameSite=Lax.
- `apps/api/src/server/documents/`: source-preserving chunks, embedding batches, completion-safe indexing and rollback.
- `apps/api/src/server/retrieval/`: session-filtered dense + BM25 hybrid search with RRF.
- `apps/api/src/server/agent/` and `guardrails/`: decision input safety → optional chat follow-up resolution → retrieval → structured draft → decision output safety; one draft repair and a 90-second answer timeout.
- `evals/`, `scripts/evaluate.ts`, `scripts/check-browser.mjs`: deterministic source checks and real service/browser checks.
- `docs/business-visual.md`: plain-language workflow visual.

Set `OPENROUTER_DECISION_MODEL=cloudflare/clef` on the API service for input/output safety checks and in local `.env` for provider checks/evals. Decisions use `/api/alpha/decisions`, not Chat Completions. Clef's documented text truncation is handled with overlapping, bounded text chunks; these checks do not verify factual entailment or full-text relationships. Source IDs remain validated locally; factual grounding requires evaluation/human review.

Verified provider choices: `qwen/qwen3-embedding-8b` (4096 dimensions), `deepseek/deepseek-v4.1-flash`. `document_chunks_v1` is the compatible hybrid collection; the old incompatible `document_chunks` was left untouched. Changing embedding models requires a new collection even if dimensions match.

## Limits

PDF (selectable text), UTF-8 TXT/Markdown, 50 MB/file, five documents/workspace, up to six retrieved passages and six prior messages. Scanned PDFs need external OCR; encrypted or malformed PDFs are rejected. Indexing has a separate 512-chunk cap (roughly 1–1.4 million text characters), so a file within the upload limit can still require splitting. Documents persist when a conversation resets; conversations do not survive refresh. Cookie expiry is seven days, but vector records are not automatically deleted. Extraction, chunking, and indexing run synchronously in the API process during the upload request; embeddings are requested from OpenRouter and vectors stored in Zilliz, with no background ingestion service. Large uploads increase API memory/CPU use and may exceed the frontend's 120-second proxy timeout; cleanup outages/process death may leave unselectable records requiring scoped operational cleanup.

Grounding is an LLM judgment, not a guarantee; inspect citations. No accounts, PDF extraction, streaming, semantic reranking or long-term chat memory. LangSmith tracing is disabled until its missing key is supplied; use fictional, non-sensitive data for remote traces. No claimed time savings or accuracy benchmark.

See `BUILD_PLAN.md` for scope and `docs/BUILD_PROGRESS.md` for actual validation/deployment outcomes.
