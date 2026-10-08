import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { askRequestSchema, citationSchema, type AskRequest, type AskResponse, type Citation } from '@document-qa/contracts';
import { AppError } from '../errors';
import { InvalidModelOutputError, schemaDiagnostics } from '../model-output';
import { retrieve } from '../retrieval';
import { chatJson } from '../providers/openrouter';
import { traceStage } from '../tracing';
import {
  draftSchema, generationMessages,
  queryResolutionMessages, queryResolutionSchema,
} from '../guardrails';

import { evaluateSafety } from '../guardrails/safety';

const MAX_CONTEXT_CHARACTERS = 32_000;
const MAX_TIMEOUT_MS = 90_000;
const insufficientAnswer = 'The selected documents do not provide enough evidence to answer this question.';
const blockedAnswer = 'I cannot provide that answer. Please ask a question about the selected documents.';

type AgentDependencies = {
  retrieve: typeof retrieve;
  chatJson: typeof chatJson;
  evaluateSafety: typeof evaluateSafety;
  traceStage?: typeof traceStage;
  timeoutMs?: number;
};

// Named stages keep this fixed workflow inspectable without an autonomous agent or tool loop.
export function createAnswerQuestion(dependencies: AgentDependencies) {
  const trace = dependencies.traceStage ?? traceStage;
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(1, dependencies.timeoutMs ?? MAX_TIMEOUT_MS));

  return async function answerQuestion(input: AskRequest & { workspaceId: string }): Promise<AskResponse> {
    const parsed = askRequestSchema.safeParse({ question: input.question, documentIds: input.documentIds, history: input.history });
    if (!parsed.success || !input.workspaceId) {
      throw new AppError('INVALID_REQUEST', 'Provide a question and select valid documents.', 400, false);
    }
    const request = parsed.data;
    const requestId = randomUUID();
    const controller = new AbortController();
    const timeoutError = new AppError('ANSWER_TIMEOUT', 'The answer took too long. Try again.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(timeoutError); }, timeoutMs);
    });
    const response = (status: AskResponse['status'], answer: string, citations: Citation[] = []): AskResponse =>
      ({ status, answer, citations, requestId });
    const stage = <T>(name: string, run: () => Promise<T>): Promise<T> => trace(name, async () => {
      if (controller.signal.aborted) throw timeoutError;
      const value = await run();
      if (controller.signal.aborted) throw timeoutError;
      return value;
    });
    // Validate even dependency-injected provider output; required guards have no repair/bypass.
    const structured = async <T>(schema: z.ZodType<T>, name: string, messages: Parameters<typeof chatJson>[0]['messages'], maxTokens: number) => {
      const raw = await dependencies.chatJson({ messages, schema, name, signal: controller.signal, maxTokens });
      const result = schema.safeParse(raw);
      if (!result.success) throw new InvalidModelOutputError({ reason: 'schema_mismatch', maxTokens, ...schemaDiagnostics(result.error) });
      return result.data;
    };
    const guard = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
      try { return await run(); }
      catch (error) {
        if (controller.signal.aborted) throw timeoutError;
        console.error(JSON.stringify({
          requestId, stage: name, code: error instanceof AppError ? error.code : 'UNEXPECTED_GUARD_ERROR',
          ...(error instanceof InvalidModelOutputError ? { validation: error.diagnostics } : {}),
        }));
        throw new AppError('GUARD_UNAVAILABLE', 'A required safety check is unavailable. Try again.');
      }
    };

    const workflow = async (): Promise<AskResponse> => {
      const safety = await stage('request_guard', () => guard('request_guard', async () => {
        for (const text of [request.question, ...request.history.map(message => message.content)]) {
          if (await dependencies.evaluateSafety(text, controller.signal) !== 'safe') return 'blocked';
        }
        return 'safe';
      }));
      if (safety === 'blocked') return response('blocked', blockedAnswer);
      const decision = request.history.length ? await stage('query_resolution', () => structured(
        queryResolutionSchema, 'query_resolution', queryResolutionMessages(request), 900,
      )) : { decision: 'allowed' as const, query: request.question, explanation: '' };
      if (decision.decision !== 'allowed') {
        const clarificationSafety = await stage('output_guard', () => guard('output_guard', () => dependencies.evaluateSafety(decision.explanation, controller.signal)));
        return clarificationSafety === 'safe' ? response(decision.decision, decision.explanation) : response('blocked', blockedAnswer);
      }

      const passages = await stage('retrieval', async () => {
        const result = z.array(citationSchema).safeParse(await dependencies.retrieve({
          workspaceId: input.workspaceId, documentIds: request.documentIds, query: decision.query,
        }));
        if (!result.success || result.data.some(passage => !request.documentIds.includes(passage.documentId) || passage.endLine < passage.startLine)) {
          throw new AppError('INVALID_RETRIEVAL_OUTPUT', 'The document search returned invalid sources. Try again.');
        }
        const selected: Citation[] = [];
        let contextSize = 0;
        const seen = new Set<string>();
        for (const passage of result.data) {
          const size = JSON.stringify(passage).length;
          if (!passage.excerpt.trim() || seen.has(passage.id) || size + contextSize > MAX_CONTEXT_CHARACTERS) continue;
          selected.push(passage);
          seen.add(passage.id);
          contextSize += size;
          if (selected.length === 6) break;
        }
        return selected;
      });
      if (passages.length === 0) return response('insufficient_evidence', insufficientAnswer);

      const messages = generationMessages(decision.query, passages);
      const draft = await stage('generation', async () => {
        try { return await structured(draftSchema, 'answer_draft', messages, 1600); }
        catch (error) {
          if (!(error instanceof AppError) || error.code !== 'INVALID_MODEL_OUTPUT') throw error;
          // One repair only; do not echo potentially malformed/untrusted model output.
          return stage('generation_repair', () => structured(draftSchema, 'answer_draft', [
            ...messages,
            { role: 'system', content: 'Your previous output did not match the required JSON schema. Retry once using the exact schema and citation/status constraints in the system instructions. Return JSON only.' },
          ], 1600));
        }
      });
      const cited = passages.filter(passage => draft.citationIds.includes(passage.id));
      const validIds = cited.length === draft.citationIds.length;
      const outputSafety = await stage('output_guard', () => guard('output_guard', () => dependencies.evaluateSafety(draft.answer, controller.signal)));
      if (outputSafety !== 'safe' || draft.status === 'blocked') return response('blocked', blockedAnswer);
      // Safety classification is not a factual entailment check. Reject invented source IDs locally.
      if (draft.status === 'answered' && validIds && cited.length > 0) return response('answered', draft.answer, cited);
      if (draft.status === 'needs_clarification') return response('needs_clarification', draft.answer);
      return response('insufficient_evidence', insufficientAnswer);
    };

    try { return await Promise.race([workflow(), timeout]); }
    catch (error) {
      if (controller.signal.aborted) throw timeoutError;
      if (error instanceof AppError) throw error;
      throw new AppError('ANSWER_UNAVAILABLE', 'The answer service is unavailable. Try again.');
    } finally { clearTimeout(timer); }
  };
}

export const answerQuestion = createAnswerQuestion({ retrieve, chatJson, evaluateSafety });
