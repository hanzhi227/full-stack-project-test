import type { z } from 'zod';
import { AppError } from './errors';

type Diagnostics = {
 reason: 'invalid_envelope' | 'invalid_json' | 'truncated_output' | 'schema_mismatch';
 finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error' | 'unknown';
 outputCharacters?: number;
 maxTokens?: number;
 issueCount?: number;
 issues?: { code: string; path: (string | number)[] }[];
};

export class InvalidModelOutputError extends AppError {
 constructor(public diagnostics: Diagnostics) {
  super('INVALID_MODEL_OUTPUT', 'The model returned invalid structured output. Try again.');
 }
}

// Never log Zod messages, values, or arbitrary keys: they can contain model/document text.
const safeFields = new Set([
 'choices', 'message', 'content', 'decision', 'query', 'explanation', 'status', 'answer',
 'citationIds', 'verdict', 'claims', 'claim', 'supported',
]);
export function schemaDiagnostics(error: z.ZodError): Pick<Diagnostics, 'issueCount' | 'issues'> {
 return {
  issueCount: error.issues.length,
  issues: error.issues.slice(0, 10).map(issue => ({
   code: issue.code,
   path: issue.path.slice(0, 8).map(part => typeof part === 'number' ? part : safeFields.has(String(part)) ? String(part) : '[redacted]'),
  })),
 };
}
