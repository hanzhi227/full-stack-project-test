import { z } from 'zod';
import { requiredEnv } from '../config';
import { AppError } from '../errors';
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
async function request(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
 const timeout = AbortSignal.timeout(30_000);
 try {
  const response = await fetch(`https://openrouter.ai/api/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${requiredEnv('OPENROUTER_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new AppError('PROVIDER_UNAVAILABLE', 'The model provider is unavailable. Try again.');
  return await response.json();
 } catch (error) {
  if (error instanceof AppError) throw error;
  throw new AppError('PROVIDER_UNAVAILABLE', 'The model provider did not respond. Try again.');
 }
}
const embeddingResponse = z.object({ data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number().finite()).min(1) })) });
export async function embedTexts(texts: string[], signal?: AbortSignal): Promise<number[][]> {
 const response = embeddingResponse.safeParse(await request('embeddings', { model: requiredEnv('OPENROUTER_EMBEDDING_MODEL'), input: texts }, signal));
 if (!response.success || response.data.data.length !== texts.length) throw new AppError('INVALID_PROVIDER_RESPONSE', 'The embedding provider returned an invalid response. Try again.');
 const ordered = response.data.data.sort((a,b) => a.index-b.index);
 if (ordered.some((row,i) => row.index !== i || row.embedding.length !== ordered[0].embedding.length)) throw new AppError('INVALID_PROVIDER_RESPONSE', 'The embedding provider returned inconsistent vectors. Try again.');
 return ordered.map(row => row.embedding);
}
export async function chatJson<T>(input: { messages: ChatMessage[]; schema: z.ZodType<T>; name: string; signal?: AbortSignal; maxTokens?: number }): Promise<T> {
 const raw = await request('chat/completions', { model: requiredEnv('OPENROUTER_CHAT_MODEL'), messages: input.messages, temperature: 0, max_tokens: input.maxTokens ?? 1200, response_format: { type: 'json_object' } }, input.signal);
 const envelope = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).safeParse(raw);
 try {
  if (!envelope.success) throw new Error();
  return input.schema.parse(JSON.parse(envelope.data.choices[0].message.content));
 } catch { throw new AppError('INVALID_MODEL_OUTPUT', `The model returned invalid ${input.name} output. Try again.`); }
}
