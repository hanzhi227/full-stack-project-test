import { z } from 'zod';
import { requiredEnv } from '../config';
import { AppError } from '../errors';
import { InvalidModelOutputError, schemaDiagnostics } from '../model-output';
export async function decisionChoice(input: { state: unknown; instructions: string; criteria: Record<string, string>; signal?: AbortSignal }): Promise<string> {
 const raw = await request('alpha/decisions', {
  model: requiredEnv('OPENROUTER_DECISION_MODEL'), state: input.state,
  questions: { decision: { type: 'choice', instructions: input.instructions, criteria: input.criteria } },
 }, input.signal);
 const result = z.object({ answers: z.object({ decision: z.object({ type: z.literal('choice'), choice: z.string() }) }) }).safeParse(raw);
 if (!result.success || !Object.hasOwn(input.criteria, result.data.answers.decision.choice)) {
  throw new AppError('INVALID_MODEL_OUTPUT', 'The decision provider returned an invalid choice. Try again.');
 }
 return result.data.answers.decision.choice;
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
async function request(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
 const timeout = AbortSignal.timeout(30_000);
 try {
  const response = await fetch(`https://openrouter.ai/api/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${requiredEnv('OPENROUTER_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new AppError('PROVIDER_UNAVAILABLE', 'The model provider is unavailable. Try again.');
  return await response.json();
 } catch (error) {
  if (error instanceof AppError) throw error;
  throw new AppError('PROVIDER_UNAVAILABLE', 'The model provider did not respond. Try again.');
 }
}
const embeddingResponse = z.object({ data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number().finite()).min(1) })) });
export async function embedTexts(texts: string[], signal?: AbortSignal): Promise<number[][]> {
 const response = embeddingResponse.safeParse(await request('v1/embeddings', { model: requiredEnv('OPENROUTER_EMBEDDING_MODEL'), input: texts }, signal));
 if (!response.success || response.data.data.length !== texts.length) throw new AppError('INVALID_PROVIDER_RESPONSE', 'The embedding provider returned an invalid response. Try again.');
 const ordered = response.data.data.sort((a,b) => a.index-b.index);
 if (ordered.some((row,i) => row.index !== i || row.embedding.length !== ordered[0].embedding.length)) throw new AppError('INVALID_PROVIDER_RESPONSE', 'The embedding provider returned inconsistent vectors. Try again.');
 return ordered.map(row => row.embedding);
}
export async function chatJson<T>(input: { messages: ChatMessage[]; schema: z.ZodType<T>; name: string; signal?: AbortSignal; maxTokens?: number }): Promise<T> {
 const raw = await request('v1/chat/completions', { model: requiredEnv('OPENROUTER_CHAT_MODEL'), messages: input.messages, temperature: 0, max_tokens: input.maxTokens ?? 1200, response_format: { type: 'json_object' } }, input.signal);
 const envelope = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }), finish_reason: z.unknown().optional() })).min(1) }).safeParse(raw);
 const maxTokens = input.maxTokens ?? 1200;
 if (!envelope.success) throw new InvalidModelOutputError({ reason: 'invalid_envelope', maxTokens, ...schemaDiagnostics(envelope.error) });
 const choice = envelope.data.choices[0];
 const finishReason = z.enum(['stop', 'length', 'content_filter', 'tool_calls', 'error']).safeParse(choice.finish_reason);
 const metadata = { maxTokens, outputCharacters: choice.message.content.length, finishReason: finishReason.success ? finishReason.data : 'unknown' as const };
 if (metadata.finishReason === 'length') throw new InvalidModelOutputError({ reason: 'truncated_output', ...metadata });
 let parsed: unknown;
 try { parsed = JSON.parse(choice.message.content); }
 catch { throw new InvalidModelOutputError({ reason: 'invalid_json', ...metadata }); }
 const result = input.schema.safeParse(parsed);
 if (!result.success) throw new InvalidModelOutputError({ reason: 'schema_mismatch', ...metadata, ...schemaDiagnostics(result.error) });
 return result.data;
}
