import { randomUUID } from 'node:crypto';
import { MAX_DOCUMENTS, MAX_FILE_BYTES, type DocumentSummary, type IngestInput } from '@document-qa/contracts';
import { AppError } from '../errors';
import { embedTexts } from '../providers/openrouter';
import { traceStage } from '../tracing';
import { getVectorStore, validateWorkspace, workspaceFilter, type ChunkMetadata, type Embedder, type InsertChunk, type VectorStore } from '../retrieval/vector-store';
import { chunkText } from './chunking';

/** Completion is committed on chunk zero, only after all chunks have been verified in storage. */
export function readyDocuments(rows: ChunkMetadata[]): DocumentSummary[] {
 const groups = new Map<string, ChunkMetadata[]>();
 for (const row of rows) { const group = groups.get(row.documentId) ?? []; group.push(row); groups.set(row.documentId, group); }
 const documents: DocumentSummary[] = [];
 for (const [id, chunks] of groups) {
  const first = chunks.find(chunk => chunk.chunkIndex === 0);
  if (!first?.isReady || chunks.length !== first.expectedChunkCount) continue;
  if (new Set(chunks.map(chunk => chunk.chunkId)).size !== chunks.length || new Set(chunks.map(chunk => chunk.chunkIndex)).size !== chunks.length) continue;
  if (chunks.some(chunk => chunk.expectedChunkCount !== first.expectedChunkCount || chunk.documentName !== first.documentName || chunk.chunkIndex >= first.expectedChunkCount)) continue;
  documents.push({ id, name: first.documentName, chunkCount: first.expectedChunkCount });
 }
 return documents.sort((a, b) => a.id.localeCompare(b.id));
}

export function createDocumentService(store: VectorStore, embed: Embedder) {
 // Single-process admission lock; multiple replicas require a shared lock/admission mechanism.
 const locks = new Map<string, Promise<void>>();
 async function exclusive<T>(workspaceId: string, run: () => Promise<T>): Promise<T> {
  const previous = locks.get(workspaceId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  locks.set(workspaceId, current);
  await previous;
  try { return await run(); } finally { release(); if (locks.get(workspaceId) === current) locks.delete(workspaceId); }
 }
 async function listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
  validateWorkspace(workspaceId);
  return traceStage('documents.list', async () => readyDocuments(await store.queryChunks(workspaceId)));
 }
 async function rollbackDocument(workspaceId: string, documentId: string): Promise<void> {
  workspaceFilter(workspaceId, [documentId]);
  await exclusive(workspaceId, () => store.deleteDocument(workspaceId, documentId));
 }
 async function ingestDocument(input: IngestInput): Promise<DocumentSummary> {
  validateWorkspace(input.workspaceId);
  if (typeof input.name !== 'string' || !input.name.trim() || Buffer.byteLength(input.name, 'utf8') > 1024) throw new AppError('INVALID_DOCUMENT_NAME', 'Use a nonempty document name of at most 1024 bytes.', 400, false);
  if (typeof input.text !== 'string' || !input.text.trim()) throw new AppError('EMPTY_DOCUMENT', 'The document contains no text.', 400, false);
  if (Buffer.byteLength(input.text, 'utf8') > MAX_FILE_BYTES) throw new AppError('DOCUMENT_TOO_LARGE', 'The document text exceeds 50 MB.', 413, false);
  const chunks = chunkText(input.text);
  return exclusive(input.workspaceId, () => traceStage('documents.ingest', async () => {
   const existing = await store.queryChunks(input.workspaceId);
   // Include unfinished documents in admission: stale partial records cannot evade the count cap.
   if (new Set(existing.map(row => row.documentId)).size >= MAX_DOCUMENTS) throw new AppError('DOCUMENT_LIMIT', 'This workspace already has five documents.', 409, false);
   const { dimension } = await store.info();
   const documentId = randomUUID();
   let first: InsertChunk | undefined;
   let insertionAttempted = false;
   try {
    for (let offset = 0; offset < chunks.length; offset += 16) {
     const batch = chunks.slice(offset, offset + 16);
     const vectors = await traceStage('documents.embed', () => embed(batch.map(chunk => chunk.text)));
     if (vectors.length !== batch.length || vectors.some(vector => vector.length !== dimension || vector.some(n => !Number.isFinite(n)))) throw new AppError('EMBEDDING_DIMENSION_MISMATCH', 'Embedding dimensions do not match the collection.', 503, false);
     const records = batch.map((chunk, i): InsertChunk => ({ ...chunk, workspaceId: input.workspaceId, documentId, chunkId: randomUUID(), documentName: input.name.trim(), expectedChunkCount: chunks.length, isReady: false, embedding: vectors[i] }));
     first ??= records[0];
     insertionAttempted = true;
     await traceStage('documents.insert', () => store.insertChunks(records));
    }
    const stored = await store.queryChunks(input.workspaceId, [documentId]);
    if (stored.length !== chunks.length || new Set(stored.map(row => row.chunkIndex)).size !== chunks.length || stored.some(row => row.chunkIndex >= chunks.length || row.expectedChunkCount !== chunks.length)) throw new AppError('INCOMPLETE_INSERT', 'The document was not fully indexed. Try again.');
    const document: DocumentSummary = { id: documentId, name: input.name.trim(), chunkCount: chunks.length };
    await store.commitChunk(first!);
    return document;
   } catch (error) {
    if (insertionAttempted) {
     try { await traceStage('documents.cleanup', () => store.deleteDocument(input.workspaceId, documentId)); }
     catch { throw new AppError('INGEST_CLEANUP_FAILED', 'Indexing failed and cleanup could not complete. Retry when the document store is available.'); }
    }
    if (error instanceof AppError) throw error;
    throw new AppError('INGEST_FAILED', 'The document could not be indexed. Try again.');
   }
  }));
 }
 return { ingestDocument, listDocuments, rollbackDocument };
}
let service: ReturnType<typeof createDocumentService> | undefined;
function getService() { return service ??= createDocumentService(getVectorStore(), embedTexts); }
export function ingestDocument(input: IngestInput): Promise<DocumentSummary> { return getService().ingestDocument(input); }
export function listDocuments(workspaceId: string): Promise<DocumentSummary[]> { return getService().listDocuments(workspaceId); }
/** Parent-owned rollback/eval cleanup only; not a public document-deletion endpoint. */
export function rollbackDocument(workspaceId: string, documentId: string): Promise<void> { return getService().rollbackDocument(workspaceId, documentId); }
