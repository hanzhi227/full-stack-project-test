import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DataType, FunctionType, type DescribeCollectionResponse } from '@zilliz/milvus2-sdk-node';
import { MAX_FILE_BYTES } from '../src/contracts';
import { AppError } from '../src/server/errors';
import { chunkText, CHUNK_CHARACTERS, CHUNK_OVERLAP, MAX_CHUNKS } from '../src/server/documents/chunking';
import { createDocumentService, readyDocuments } from '../src/server/documents';
import { createRetrievalService, MAX_CONTEXT_CHARACTERS } from '../src/server/retrieval';
import { collectionFields, MilvusVectorStore, validateCollection, workspaceFilter, type ChunkMetadata, type InsertChunk, type StoredChunk, type VectorStore } from '../src/server/retrieval/vector-store';

const workspaceId = randomUUID();
const documentId = randomUUID();
const embed = async (texts: string[]) => texts.map(() => [1, 0, 0]);
const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;
function record(overrides: Partial<InsertChunk> = {}): InsertChunk {
 return { workspaceId, documentId, chunkId: randomUUID(), documentName: 'Policy.txt', text: 'Keep the receipt.', startLine: 1, endLine: 1, chunkIndex: 0, expectedChunkCount: 1, isReady: true, embedding: [1, 0, 0], ...overrides };
}
class MemoryStore implements VectorStore {
 rows: InsertChunk[] = [];
 insertCalls = 0;
 deletes: { workspaceId: string; documentId: string }[] = [];
 failInsertAt = 0;
 failCommit = false;
 failCleanup = false;
 info = async () => ({ dimension: 3, strategy: 'dense' as const });
 async queryChunks(workspace: string, ids?: string[]): Promise<ChunkMetadata[]> {
  workspaceFilter(workspace, ids);
  return this.rows.filter(row => row.workspaceId === workspace && (!ids || ids.includes(row.documentId)));
 }
 async insertChunks(rows: InsertChunk[]) {
  this.insertCalls++;
  // Simulate uncertain/partial insertion: some rows persist even when the request fails.
  this.rows.push(...rows.slice(0, this.insertCalls === this.failInsertAt ? 1 : rows.length));
  if (this.insertCalls === this.failInsertAt) throw new Error('simulated insert outage');
 }
 async commitChunk(row: InsertChunk) {
  if (this.failCommit) throw new Error('simulated commit outage');
  this.rows = this.rows.map(current => current.chunkId === row.chunkId ? { ...row, isReady: true } : current);
 }
 async deleteDocument(workspace: string, id: string) {
  workspaceFilter(workspace, [id]); this.deletes.push({ workspaceId: workspace, documentId: id });
  if (this.failCleanup) throw new Error('simulated delete outage');
  this.rows = this.rows.filter(row => row.workspaceId !== workspace || row.documentId !== id);
 }
 async search(workspace: string, ids: string[]): Promise<StoredChunk[]> {
  workspaceFilter(workspace, ids);
  return this.rows.filter(row => row.workspaceId === workspace && ids.includes(row.documentId));
 }
}
function description(hybrid = false): DescribeCollectionResponse {
 return {
  status: { error_code: 'Success', code: 0 },
  schema: {
   enable_dynamic_field: false,
   fields: collectionFields(3, hybrid).map(field => ({ ...field, dataType: field.data_type, data_type: DataType[field.data_type as DataType], type_params: Object.entries(field).filter(([key]) => ['dim', 'max_length', 'enable_analyzer'].includes(key)).map(([key, value]) => ({ key, value: String(value) })) })),
   functions: hybrid ? [{ name: 'text_bm25', type: FunctionType.BM25, input_field_names: ['text'], output_field_names: ['sparse'], params: {} }] : []
  }
 } as unknown as DescribeCollectionResponse;
}

test('chunkText preserves exact CRLF source slices, 480-character overlap, spans and order', () => {
 const text = Array.from({ length: 600 }, (_, i) => `Policy line ${i + 1}: Keep an itemized receipt.\r\n`).join('');
 const chunks = chunkText(text);
 assert.ok(chunks.length > 1);
 let start = 0;
 let reconstructed = '';
 for (const [i, chunk] of chunks.entries()) {
  assert.equal(chunk.chunkIndex, i);
  assert.ok(chunk.text.length <= CHUNK_CHARACTERS);
  assert.equal(chunk.text, text.slice(start, start + chunk.text.length));
  assert.equal(chunk.startLine, text.slice(0, start).split('\n').length);
  assert.equal(chunk.endLine, text.slice(0, start + chunk.text.length - 1).split('\n').length);
  reconstructed += i === 0 ? chunk.text : chunk.text.slice(CHUNK_OVERLAP);
  start += chunk.text.length - CHUNK_OVERLAP;
 }
 assert.equal(reconstructed, text);
});
test('chunkText handles long one-line text, repeated text, Unicode, blanks and chunk cap', () => {
 assert.throws(() => chunkText(' \r\n\t'), code('EMPTY_DOCUMENT'));
 const text = '😀'.repeat(7000);
 const chunks = chunkText(text);
 assert.ok(chunks.every(chunk => chunk.startLine === 1 && chunk.endLine === 1 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk.text)));
 const rebuilt = chunks[0].text + chunks.slice(1).map(chunk => chunk.text.slice(CHUNK_OVERLAP)).join('');
 assert.equal(rebuilt, text);
 assert.throws(() => chunkText('a'.repeat((CHUNK_CHARACTERS - CHUNK_OVERLAP) * (MAX_CHUNKS + 1))), code('DOCUMENT_TOO_COMPLEX'));
});
test('workspaceFilter validates UUIDs and bounds/escapes selected documents', () => {
 assert.equal(workspaceFilter(workspaceId, [documentId]), `workspaceId == "${workspaceId}" and documentId in ["${documentId}"]`);
 assert.throws(() => workspaceFilter('x" or true'), code('INVALID_WORKSPACE'));
 for (const ids of [[], ['x'], [documentId, documentId], Array.from({ length: 6 }, () => randomUUID())]) assert.throws(() => workspaceFilter(workspaceId, ids), code('INVALID_DOCUMENT_SELECTION'));
});
test('readyDocuments groups only complete committed documents with contiguous unique indices', () => {
 const first = record({ expectedChunkCount: 2 });
 const second = record({ expectedChunkCount: 2, chunkIndex: 1, isReady: false });
 assert.deepEqual(readyDocuments([second, first]), [{ id: documentId, name: 'Policy.txt', chunkCount: 2 }]);
 for (const rows of [[first], [{ ...first, isReady: false }, second], [first, { ...second, chunkIndex: 0 }], [first, { ...second, chunkIndex: 2 }], [first, { ...second, expectedChunkCount: 3 }]]) assert.deepEqual(readyDocuments(rows), []);
});
test('ingestDocument batches vectors, hides pending records, commits, lists and rolls back only its document', async () => {
 const store = new MemoryStore();
 const other = record({ workspaceId: randomUUID() }); store.rows.push(other);
 const service = createDocumentService(store, async texts => {
  assert.deepEqual(await service.listDocuments(workspaceId), []);
  return embed(texts);
 });
 const result = await service.ingestDocument({ workspaceId, name: ' Handbook.md ', text: 'A'.repeat(90_000) });
 assert.ok(store.insertCalls > 1);
 assert.equal(result.name, 'Handbook.md');
 assert.equal(result.chunkCount, chunkText('A'.repeat(90_000)).length);
 assert.deepEqual(await service.listDocuments(workspaceId), [result]);
 assert.equal(store.rows.filter(row => row.documentId === result.id && row.isReady).length, 1);
 await service.rollbackDocument(workspaceId, result.id);
 assert.deepEqual(store.rows, [other]);
});
test('ingestDocument removes uncertain partial insert, preserves other workspace, and never lists it ready', async () => {
 const store = new MemoryStore(); store.failInsertAt = 2;
 const other = record({ workspaceId: randomUUID() }); store.rows.push(other);
 const service = createDocumentService(store, embed);
 await assert.rejects(service.ingestDocument({ workspaceId, name: 'Policy.txt', text: 'a'.repeat(90_000) }), code('INGEST_FAILED'));
 assert.equal(store.deletes.length, 1);
 assert.equal(store.deletes[0].workspaceId, workspaceId);
 assert.deepEqual(await service.listDocuments(workspaceId), []);
 assert.deepEqual(store.rows, [other]);
});
test('ingestDocument cleans embedding failures after an inserted batch and commit failures', async () => {
 for (const failure of ['embedding', 'commit']) {
  const store = new MemoryStore(); store.failCommit = failure === 'commit';
  let calls = 0;
  const service = createDocumentService(store, async texts => { if (++calls === 2 && failure === 'embedding') throw new Error('outage'); return embed(texts); });
  await assert.rejects(service.ingestDocument({ workspaceId, name: 'Policy.txt', text: 'a'.repeat(90_000) }), code('INGEST_FAILED'));
  assert.deepEqual(store.rows, []);
 }
});
test('ingestDocument reports cleanup failure without exposing partial document as ready', async () => {
 const store = new MemoryStore(); store.failInsertAt = 1; store.failCleanup = true;
 const service = createDocumentService(store, embed);
 await assert.rejects(service.ingestDocument({ workspaceId, name: 'Policy.txt', text: 'Keep receipts' }), code('INGEST_CLEANUP_FAILED'));
 assert.equal(store.rows.length, 1);
 assert.deepEqual(await service.listDocuments(workspaceId), []);
});
test('ingestDocument rejects invalid input and inconsistent vectors without insertion', async () => {
 const store = new MemoryStore(); const service = createDocumentService(store, embed);
 for (const [input, errorCode] of [
  [{ workspaceId, name: 'p.txt', text: '' }, 'EMPTY_DOCUMENT'],
  [{ workspaceId, name: '', text: 'text' }, 'INVALID_DOCUMENT_NAME'],
  [{ workspaceId, name: 'p.txt', text: 'a'.repeat(MAX_FILE_BYTES + 1) }, 'DOCUMENT_TOO_LARGE'],
  [{ workspaceId: 'not-a-uuid', name: 'p.txt', text: 'text' }, 'INVALID_WORKSPACE']
 ] as const) await assert.rejects(service.ingestDocument(input), code(errorCode));
 await assert.rejects(createDocumentService(store, async () => [[1]]).ingestDocument({ workspaceId, name: 'p.txt', text: 'text' }), code('EMBEDDING_DIMENSION_MISMATCH'));
 assert.equal(store.insertCalls, 0);
});
test('ingestDocument serializes six concurrent uploads and enforces five-document limit', async () => {
 const store = new MemoryStore();
 const service = createDocumentService(store, async texts => { await new Promise(resolve => setTimeout(resolve, 2)); return embed(texts); });
 const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => service.ingestDocument({ workspaceId, name: `Policy-${i}.txt`, text: 'Keep receipts' })));
 assert.equal(results.filter(result => result.status === 'fulfilled').length, 5);
 const rejected = results.find(result => result.status === 'rejected');
 assert.ok(rejected?.status === 'rejected' && code('DOCUMENT_LIMIT')(rejected.reason));
 assert.equal((await service.listDocuments(workspaceId)).length, 5);
});
test('retrieve enforces ownership before embedding/search, returns exact citations and bounds context', async () => {
 const store = new MemoryStore();
 for (let i = 0; i < 8; i++) store.rows.push(record({ chunkIndex: i, expectedChunkCount: 8, isReady: i === 0, text: 'a'.repeat(3200), startLine: i + 1, endLine: i + 1 }));
 const docs = createDocumentService(store, embed);
 let calls = 0;
 const retrieve = createRetrievalService(store, async texts => { calls++; return embed(texts); }, docs.listDocuments);
 await assert.rejects(retrieve({ workspaceId: randomUUID(), documentIds: [documentId], query: 'receipts?' }), code('DOCUMENT_NOT_FOUND'));
 assert.equal(calls, 0);
 const citations = await retrieve({ workspaceId, documentIds: [documentId], query: 'receipts?' });
 assert.equal(citations.length, 6);
 assert.equal(citations.reduce((sum, row) => sum + row.excerpt.length, 0), MAX_CONTEXT_CHARACTERS);
 assert.deepEqual(citations[0], { id: store.rows[0].chunkId, documentId, documentName: 'Policy.txt', excerpt: store.rows[0].text, startLine: 1, endLine: 1 });
 await assert.rejects(retrieve({ workspaceId, documentIds: [documentId], query: ' ' }), code('INVALID_QUERY'));
});
test('retrieve fails closed if adapter leaks another workspace and removes duplicate chunk IDs', async () => {
 const store = new MemoryStore(); const row = record(); store.rows = [row];
 const service = createRetrievalService(store, embed, async () => [{ id: documentId, name: row.documentName, chunkCount: 1 }]);
 store.search = async () => [row, row];
 assert.equal((await service({ workspaceId, documentIds: [documentId], query: 'receipts?' })).length, 1);
 store.search = async () => [{ ...row, workspaceId: randomUUID() }];
 await assert.rejects(service({ workspaceId, documentIds: [documentId], query: 'receipts?' }), code('INVALID_RETRIEVAL_RESULT'));
});
test('validateCollection accepts exact owned schemas but rejects unknown schemas and wrong dimensions without mutation', () => {
 const dense = description();
 const before = JSON.stringify(dense);
 assert.deepEqual(validateCollection(dense, 3), { dimension: 3, strategy: 'dense' });
 assert.equal(JSON.stringify(dense), before);
 assert.deepEqual(validateCollection(description(true), 3), { dimension: 3, strategy: 'hybrid' });
 assert.throws(() => validateCollection(dense, 4096), code('VECTOR_SCHEMA_MISMATCH'));
 const unknown = description(); unknown.schema.fields = unknown.schema.fields.filter(field => field.name === 'embedding');
 assert.throws(() => validateCollection(unknown), code('VECTOR_SCHEMA_MISMATCH'));
 const extra = description(); extra.schema.fields.push({ ...extra.schema.fields[0], name: 'unknown' });
 assert.throws(() => validateCollection(extra), code('VECTOR_SCHEMA_MISMATCH'));
 const unbounded = description(); unbounded.schema.fields.find(field => field.name === 'text')!.type_params = [];
 assert.throws(() => validateCollection(unbounded), code('VECTOR_SCHEMA_MISMATCH'));
});
test('MilvusVectorStore applies strong workspace/selected-doc filters to query, delete, dense and both hybrid arms', async () => {
 for (const hybrid of [false, true]) {
  const calls: { kind: string; params: Record<string, unknown> }[] = [];
  const row = record();
  const status = { error_code: 'Success', code: 0 };
  const client = {
   describeCollection: async () => description(hybrid),
   query: async (params: Record<string, unknown>) => { calls.push({ kind: 'query', params }); return { status, data: [row] }; },
   delete: async (params: Record<string, unknown>) => { calls.push({ kind: 'delete', params }); return { status }; },
   search: async (params: Record<string, unknown>) => { calls.push({ kind: 'search', params }); return { status, results: [row] }; }
  } as unknown as ConstructorParameters<typeof MilvusVectorStore>[0];
  const store = new MilvusVectorStore(client, 'test_collection');
  await store.queryChunks(workspaceId, [documentId]);
  await store.deleteDocument(workspaceId, documentId);
  await store.search(workspaceId, [documentId], [1, 0, 0], 'receipts');
  const expected = workspaceFilter(workspaceId, [documentId]);
  assert.equal(calls[0].params.filter, expected);
  assert.equal(calls[1].params.filter, expected);
  assert.ok(calls.every(call => call.params.consistency_level !== undefined));
  if (hybrid) {
   const arms = calls[2].params.data as { expr: string; topk: number }[];
   assert.equal(arms.length, 2); assert.ok(arms.every(arm => arm.expr === expected && arm.topk === 12));
   assert.deepEqual(calls[2].params.rerank, { strategy: 'rrf', params: { k: 60 } });
  } else assert.equal(calls[2].params.filter, expected);
  await assert.rejects(store.search(workspaceId, [documentId], [1], 'receipts'), code('EMBEDDING_DIMENSION_MISMATCH'));
  assert.equal(calls.length, 3);
 }
});

test('unfinished documents count toward admission and rollback remains workspace-scoped even with the same document UUID', async () => {
 const store = new MemoryStore();
 for (let i = 0; i < 5; i++) store.rows.push(record({ documentId: i ? randomUUID() : documentId, isReady: false }));
 const stranger = record({ workspaceId: randomUUID() }); store.rows.push(stranger);
 const service = createDocumentService(store, embed);
 assert.deepEqual(await service.listDocuments(workspaceId), []);
 await assert.rejects(service.ingestDocument({ workspaceId, name: 'p.txt', text: 'text' }), code('DOCUMENT_LIMIT'));
 await service.rollbackDocument(workspaceId, documentId);
 assert.ok(store.rows.includes(stranger));
 assert.equal(store.rows.filter(row => row.workspaceId === workspaceId).length, 4);
});
test('MilvusVectorStore rejects partial mutation responses and invalid/leaked query/search rows', async () => {
 const status = { error_code: 'Success', code: 0 };
 const client = {
  describeCollection: async () => description(),
  insert: async () => ({ status, err_index: [1], insert_cnt: '1' }),
  upsert: async () => ({ status, err_index: [], upsert_cnt: '0' }),
  query: async () => ({ status, data: [record({ workspaceId: randomUUID() })] }),
  search: async () => ({ status, results: [record({ documentId: randomUUID() })] })
 } as unknown as ConstructorParameters<typeof MilvusVectorStore>[0];
 const store = new MilvusVectorStore(client, 'test_collection');
 await assert.rejects(store.insertChunks([record(), record()]), code('INCOMPLETE_INSERT'));
 await assert.rejects(store.commitChunk(record()), code('INCOMPLETE_INSERT'));
 await assert.rejects(store.queryChunks(workspaceId, [documentId]), code('INVALID_STORED_DOCUMENT'));
 await assert.rejects(store.search(workspaceId, [documentId], [1, 0, 0], 'receipts'), code('INVALID_RETRIEVAL_RESULT'));
});
test('MilvusVectorStore surfaces non-success SDK status as sanitized retryable application error', async () => {
 const client = { describeCollection: async () => ({ ...description(), status: { error_code: 'UnexpectedError', code: 1, reason: 'private internal details' } }) } as unknown as ConstructorParameters<typeof MilvusVectorStore>[0];
 const store = new MilvusVectorStore(client, 'test_collection');
 await assert.rejects(store.info(), (error: unknown) => error instanceof AppError && error.code === 'VECTOR_STORE_UNAVAILABLE' && error.retryable && !error.message.includes('private'));
});
test('chunkText admits maximum-size ASCII files with dense paragraph boundaries within the chunk cap', () => {
 const text = ('a'.repeat(2559) + '\n\n').repeat(400).slice(0, MAX_FILE_BYTES);
 assert.equal(Buffer.byteLength(text), MAX_FILE_BYTES);
 const chunks = chunkText(text);
 assert.ok(chunks.length <= MAX_CHUNKS);
 assert.ok(chunks.every(chunk => chunk.text.length <= CHUNK_CHARACTERS));
 assert.equal(chunks[0].text + chunks.slice(1).map(chunk => chunk.text.slice(CHUNK_OVERLAP)).join(''), text);
});
