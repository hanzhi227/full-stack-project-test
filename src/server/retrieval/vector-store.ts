import { ConsistencyLevelEnum, DataType, FunctionType, MilvusClient, type DescribeCollectionResponse, type FieldType, type ResStatus } from '@zilliz/milvus2-sdk-node';
import { z } from 'zod';
import { MAX_DOCUMENTS } from '../../contracts';
import { requiredEnv } from '../config';
import { AppError } from '../errors';
import { MAX_CHUNKS } from '../documents/chunking';

export const metadataFields = ['workspaceId', 'documentId', 'chunkId', 'documentName', 'startLine', 'endLine', 'chunkIndex', 'expectedChunkCount', 'isReady'];
export const MAX_WORKSPACE_ROWS = (MAX_DOCUMENTS + 1) * MAX_CHUNKS + 1;
const uuid = z.string().uuid();
const metadataSchema = z.object({
 workspaceId: uuid, documentId: uuid, chunkId: uuid, documentName: z.string().min(1),
 startLine: z.number().int().positive(), endLine: z.number().int().positive(),
 chunkIndex: z.number().int().min(0).max(MAX_CHUNKS - 1), expectedChunkCount: z.number().int().min(1).max(MAX_CHUNKS), isReady: z.boolean()
});
const storedChunkSchema = metadataSchema.extend({ text: z.string().min(1).max(3200) });
export type ChunkMetadata = z.infer<typeof metadataSchema>;
export type StoredChunk = z.infer<typeof storedChunkSchema>;
export type InsertChunk = StoredChunk & { embedding: number[] };
export type CollectionInfo = { dimension: number; strategy: 'dense' | 'hybrid'; };
export type Embedder = (texts: string[]) => Promise<number[][]>;
export interface VectorStore {
 info(): Promise<CollectionInfo>;
 queryChunks(workspaceId: string, documentIds?: string[]): Promise<ChunkMetadata[]>;
 insertChunks(chunks: InsertChunk[]): Promise<void>;
 commitChunk(chunk: InsertChunk): Promise<void>;
 deleteDocument(workspaceId: string, documentId: string): Promise<void>;
 search(workspaceId: string, documentIds: string[], vector: number[], query: string): Promise<StoredChunk[]>;
}

export function validateWorkspace(workspaceId: string): void {
 if (!uuid.safeParse(workspaceId).success) throw new AppError('INVALID_WORKSPACE', 'Invalid workspace.', 400, false);
}
export function workspaceFilter(workspaceId: string, documentIds?: string[]): string {
 validateWorkspace(workspaceId);
 if (documentIds !== undefined && (!documentIds.length || documentIds.length > MAX_DOCUMENTS || new Set(documentIds).size !== documentIds.length || documentIds.some(id => !uuid.safeParse(id).success))) {
  throw new AppError('INVALID_DOCUMENT_SELECTION', 'Select one to five valid documents.', 400, false);
 }
 return `workspaceId == ${JSON.stringify(workspaceId)}` + (documentIds ? ` and documentId in ${JSON.stringify(documentIds)}` : '');
}
export function checkStatus(response: { status: Pick<ResStatus, 'error_code' | 'code'> }): void {
 if (![0, '0', 'Success'].includes(response.status.error_code) || (response.status.code !== undefined && response.status.code !== 0)) {
  throw new AppError('VECTOR_STORE_UNAVAILABLE', 'The document store is unavailable. Try again.');
 }
}
export function collectionFields(dimension: number, hybrid: boolean): FieldType[] {
 const string = (name: string, max_length: number): FieldType => ({ name, data_type: DataType.VarChar, max_length });
 return [
  { ...string('chunkId', 36), is_primary_key: true, autoID: false },
  string('workspaceId', 36), string('documentId', 36), string('documentName', 1024),
  { ...string('text', 16384), ...(hybrid ? { enable_analyzer: true } : {}) },
  ...['startLine', 'endLine', 'chunkIndex', 'expectedChunkCount'].map(name => ({ name, data_type: DataType.Int32 })),
  { name: 'isReady', data_type: DataType.Bool },
  { name: 'embedding', data_type: DataType.FloatVector, dim: dimension },
  ...(hybrid ? [{ name: 'sparse', data_type: DataType.SparseFloatVector }] : [])
 ];
}
/** Read-only check: neither request handling nor setup migrates an unknown schema. */
export function validateCollection(description: DescribeCollectionResponse, expectedDimension?: number): CollectionInfo {
 checkStatus(description);
 const fields = description.schema.fields;
 const embedding = fields.find(f => f.name === 'embedding');
 const parameter = (name: string, key: string) => fields.find(f => f.name === name)?.type_params.find(p => p.key === key)?.value;
 const dimension = Number(parameter('embedding', 'dim'));
 const fail = (): never => { throw new AppError('VECTOR_SCHEMA_MISMATCH', 'The collection schema is incompatible. Run vector setup with a new collection name; existing collections are never replaced.', 503, false); };
 if (!Number.isInteger(dimension) || dimension < 1 || (expectedDimension !== undefined && dimension !== expectedDimension)) fail();
 for (const required of collectionFields(dimension, false)) {
  const actual = fields.find(f => f.name === required.name);
  if (!actual || Number(actual.dataType ?? DataType[actual.data_type]) !== required.data_type || actual.nullable || actual.autoID) fail();
  if (required.is_primary_key && !actual?.is_primary_key) fail();
  const maxLength = Number(parameter(required.name, 'max_length'));
  if (required.max_length && (!Number.isInteger(maxLength) || maxLength < Number(required.max_length))) fail();
 }
 if (!embedding || fields.filter(f => f.is_primary_key).length !== 1 || description.schema.enable_dynamic_field) fail();
 const sparse = fields.find(f => f.name === 'sparse');
 const functions = description.schema.functions ?? description.functions ?? [];
 const bm25 = functions.find(f => (f.type === FunctionType.BM25 || String(f.type) === 'BM25') && f.input_field_names.join() === 'text' && f.output_field_names?.join() === 'sparse');
 const hybrid = !!sparse && !!bm25;
 if ((sparse || functions.length) && (!hybrid || functions.length !== 1 || Number(sparse?.dataType ?? DataType[sparse!.data_type]) !== DataType.SparseFloatVector || String(parameter('text', 'enable_analyzer')) !== 'true')) fail();
 const known = new Set(collectionFields(dimension, hybrid).map(f => f.name));
 if (fields.some(f => !known.has(f.name))) fail();
 return { dimension, strategy: hybrid ? 'hybrid' : 'dense' };
}

export function createMilvusClient(): MilvusClient {
 return new MilvusClient({ address: requiredEnv('ZILLIZ_ENDPOINT'), token: requiredEnv('ZILLIZ_TOKEN'), timeout: 20_000, maxRetries: 1, logLevel: 'error' });
}
export function collectionName(): string {
 const name = process.env.ZILLIZ_COLLECTION?.trim() || 'document_chunks_v1';
 if (!/^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(name)) throw new AppError('INVALID_COLLECTION_NAME', 'Set a valid ZILLIZ_COLLECTION on the server.', 503, false);
 return name;
}
type StoreClient = Pick<MilvusClient, 'describeCollection' | 'query' | 'insert' | 'upsert' | 'delete' | 'search'>;
export class MilvusVectorStore implements VectorStore {
 private metadata?: Promise<CollectionInfo>;
 constructor(private client: StoreClient, private collection: string) {}
 private async operation<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
   if (error instanceof AppError) throw error;
   throw new AppError('VECTOR_STORE_UNAVAILABLE', 'The document store did not respond. Try again.');
  }
 }
 info(): Promise<CollectionInfo> {
  return this.metadata ??= this.operation(async () => validateCollection(await this.client.describeCollection({ collection_name: this.collection, cache: false }))).catch(error => { this.metadata = undefined; throw error; });
 }
 async queryChunks(workspaceId: string, documentIds?: string[]): Promise<ChunkMetadata[]> {
  const filter = workspaceFilter(workspaceId, documentIds);
  return this.operation(async () => {
   await this.info();
   const response = await this.client.query({ collection_name: this.collection, filter, output_fields: metadataFields, limit: MAX_WORKSPACE_ROWS, consistency_level: ConsistencyLevelEnum.Strong });
   checkStatus(response);
   if (response.data.length >= MAX_WORKSPACE_ROWS) throw new AppError('WORKSPACE_LIMIT_EXCEEDED', 'The workspace contains too many chunks.', 409, false);
   return response.data.map(row => {
    const parsed = metadataSchema.safeParse(row);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId || (documentIds && !documentIds.includes(parsed.data.documentId))) throw new AppError('INVALID_STORED_DOCUMENT', 'The stored document metadata is invalid.', 503, false);
    return parsed.data;
   });
  });
 }
 private async write(chunks: InsertChunk[], upsert: boolean): Promise<void> {
  return this.operation(async () => {
   const { dimension } = await this.info();
   if (!chunks.length || chunks.some(row => !storedChunkSchema.safeParse(row).success || row.embedding.length !== dimension || row.embedding.some(n => !Number.isFinite(n)))) throw new AppError('INVALID_CHUNKS', 'Invalid document vectors or metadata.', 503, false);
   const response = await this.client[upsert ? 'upsert' : 'insert']({ collection_name: this.collection, data: chunks });
   checkStatus(response);
   if (response.err_index.length || Number(upsert ? response.upsert_cnt : response.insert_cnt) !== chunks.length) throw new AppError('INCOMPLETE_INSERT', 'The document was not fully indexed. Try again.');
  });
 }
 insertChunks(chunks: InsertChunk[]): Promise<void> { return this.write(chunks, false); }
 commitChunk(chunk: InsertChunk): Promise<void> { return this.write([{ ...chunk, isReady: true }], true); }
 async deleteDocument(workspaceId: string, documentId: string): Promise<void> {
  const filter = workspaceFilter(workspaceId, [documentId]);
  await this.operation(async () => {
   await this.info();
   checkStatus(await this.client.delete({ collection_name: this.collection, filter, consistency_level: 'Strong' }));
  });
 }
 async search(workspaceId: string, documentIds: string[], vector: number[], query: string): Promise<StoredChunk[]> {
  const filter = workspaceFilter(workspaceId, documentIds);
  return this.operation(async () => {
   const info = await this.info();
   if (vector.length !== info.dimension || vector.some(n => !Number.isFinite(n))) throw new AppError('EMBEDDING_DIMENSION_MISMATCH', 'Embedding dimensions do not match the collection.', 503, false);
   const common = { collection_name: this.collection, output_fields: [...metadataFields, 'text'], limit: 6, consistency_level: ConsistencyLevelEnum.Strong };
   const response = info.strategy === 'hybrid'
    ? await this.client.search({ ...common, data: [
       { anns_field: 'embedding', data: vector, expr: filter, topk: 12, metric_type: 'COSINE', params: {} },
       { anns_field: 'sparse', data: query, expr: filter, topk: 12, metric_type: 'BM25', params: {} }
      ], rerank: { strategy: 'rrf', params: { k: 60 } } })
    : await this.client.search({ ...common, anns_field: 'embedding', data: vector, filter, metric_type: 'COSINE' });
   checkStatus(response);
   const rows = response.results.flat();
   return rows.map(row => {
    const parsed = storedChunkSchema.safeParse(row);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId || !documentIds.includes(parsed.data.documentId)) throw new AppError('INVALID_RETRIEVAL_RESULT', 'The document store returned an invalid passage.', 503, false);
    return parsed.data;
   });
  });
 }
}
let defaultStore: VectorStore | undefined;
export function getVectorStore(): VectorStore {
 return defaultStore ??= new MilvusVectorStore(createMilvusClient(), collectionName());
}
