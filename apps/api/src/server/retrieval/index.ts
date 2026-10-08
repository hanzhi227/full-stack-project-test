import type { Citation, DocumentSummary, RetrieveInput } from '@document-qa/contracts';
import { listDocuments } from '../documents';
import { AppError } from '../errors';
import { embedTexts } from '../providers/openrouter';
import { traceStage } from '../tracing';
import { getVectorStore, workspaceFilter, type Embedder, type VectorStore } from './vector-store';

export const MAX_PASSAGES = 6;
export const MAX_CONTEXT_CHARACTERS = 19_200;
export function createRetrievalService(store: VectorStore, embed: Embedder, list: (workspaceId: string) => Promise<DocumentSummary[]>) {
 return async function retrieve(input: RetrieveInput): Promise<Citation[]> {
  workspaceFilter(input.workspaceId, input.documentIds);
  if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 2000) throw new AppError('INVALID_QUERY', 'Enter a question of one to 2000 characters.', 400, false);
  return traceStage('retrieval', async () => {
   const documents = await list(input.workspaceId);
   if (input.documentIds.some(id => !documents.some(document => document.id === id))) throw new AppError('DOCUMENT_NOT_FOUND', 'One or more selected documents are unavailable in this workspace.', 404, false);
   const vectors = await traceStage('retrieval.embed', () => embed([input.query.trim()]));
   if (vectors.length !== 1) throw new AppError('INVALID_PROVIDER_RESPONSE', 'The embedding provider returned an invalid response. Try again.');
   const rows = await traceStage('retrieval.search', () => store.search(input.workspaceId, input.documentIds, vectors[0], input.query.trim()));
   const citations: Citation[] = [];
   const seen = new Set<string>();
   let characters = 0;
   for (const row of rows) {
    // Defense in depth for deterministic adapters as well as the live store.
    const document = documents.find(document => document.id === row.documentId);
    if (row.workspaceId !== input.workspaceId || !input.documentIds.includes(row.documentId) || !document || row.chunkIndex >= document.chunkCount || row.expectedChunkCount !== document.chunkCount || row.endLine < row.startLine) throw new AppError('INVALID_RETRIEVAL_RESULT', 'The document store returned an invalid passage.', 503, false);
    if (seen.has(row.chunkId) || !row.text.trim()) continue;
    if (citations.length >= MAX_PASSAGES || characters + row.text.length > MAX_CONTEXT_CHARACTERS) break;
    seen.add(row.chunkId); characters += row.text.length;
    citations.push({ id: row.chunkId, documentId: row.documentId, documentName: row.documentName, excerpt: row.text, startLine: row.startLine, endLine: row.endLine });
   }
   return citations;
  });
 };
}
export function retrieve(input: RetrieveInput): Promise<Citation[]> {
 return createRetrievalService(getVectorStore(), embedTexts, listDocuments)(input);
}
