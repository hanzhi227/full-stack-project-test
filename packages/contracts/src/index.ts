import { z } from 'zod';
export const MAX_FILE_BYTES = 50_000_000;
export const MAX_DOCUMENTS = 5;
export const documentSummarySchema = z.object({ id: z.string().uuid(), name: z.string(), chunkCount: z.number().int().positive() });
export const citationSchema = z.object({ id: z.string(), documentId: z.string().uuid(), documentName: z.string(), excerpt: z.string(), startLine: z.number().int().positive(), endLine: z.number().int().positive() });
export const askRequestSchema = z.object({
 question: z.string().trim().min(1).max(2000),
 documentIds: z.array(z.string().uuid()).min(1).max(5).refine(ids => new Set(ids).size === ids.length, 'Duplicate document IDs'),
 history: z.array(z.object({ role: z.enum(['user','assistant']), content: z.string().min(1).max(8000) }).strict()).max(6).default([])
}).strict();
export const askResponseSchema = z.object({ status: z.enum(['answered','needs_clarification','insufficient_evidence','blocked']), answer: z.string(), citations: z.array(citationSchema), requestId: z.string() });
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
export type Citation = z.infer<typeof citationSchema>;
export type AskRequest = z.infer<typeof askRequestSchema>;
export type AskResponse = z.infer<typeof askResponseSchema>;
export type ApiError = { error: { code: string; message: string; retryable: boolean }; requestId: string };
export type IngestInput = { workspaceId: string; name: string; text: string };
export type RetrieveInput = { workspaceId: string; documentIds: string[]; query: string };
