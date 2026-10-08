import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { FunctionType, type ResStatus } from '@zilliz/milvus2-sdk-node';
import { AppError } from '../apps/api/src/server/errors';
import { embedTexts } from '../apps/api/src/server/providers/openrouter';
import { createDocumentService } from '../apps/api/src/server/documents';
import { createRetrievalService } from '../apps/api/src/server/retrieval';
import { checkStatus, collectionFields, collectionName, createMilvusClient, MilvusVectorStore, validateCollection } from '../apps/api/src/server/retrieval/vector-store';

export type SetupResult = { collection: string; dimension: number; strategy: 'dense' | 'hybrid'; created: boolean; denseFallbackReason?: string };
function succeeded(status: ResStatus): boolean { return [0, '0', 'Success'].includes(status.error_code) && !status.code; }

/** Run outside request handling. Existing unknown collections are never migrated or dropped. */
export async function setupVectorStore(): Promise<SetupResult> {
 const vectors = await embedTexts(['Embedding dimension probe for fictional handbook setup.']);
 const dimension = vectors[0]?.length;
 if (!dimension || vectors.length !== 1 || vectors[0].some(n => !Number.isFinite(n))) throw new AppError('INVALID_PROVIDER_RESPONSE', 'Cannot determine embedding dimensions.');
 const client = createMilvusClient();
 const collection = collectionName();
 let created = false;
 let denseFallbackReason: string | undefined;
 try {
  const exists = await client.hasCollection({ collection_name: collection });
  checkStatus(exists);
  if (!exists.value) {
   const response = await client.createCollection({
    collection_name: collection, enable_dynamic_field: false, consistency_level: 'Strong',
    fields: collectionFields(dimension, true),
    functions: [{ name: 'text_bm25', type: FunctionType.BM25, input_field_names: ['text'], output_field_names: ['sparse'], params: {} }]
   });
   if (!succeeded(response)) {
    // Only explicit feature non-support permits dense fallback, never outages or schema errors.
    if (!/not supported|unsupported|not available/i.test(response.reason) || !/bm25|function|analyzer|sparse/i.test(response.reason)) checkStatus({ status: response });
    const after = await client.hasCollection({ collection_name: collection });
    checkStatus(after);
    if (after.value) throw new AppError('VECTOR_SETUP_INCOMPLETE', 'Hybrid creation failed after creating a collection. Inspect it or choose a new collection name; setup will not delete it.', 503, false);
    checkStatus({ status: await client.createCollection({ collection_name: collection, enable_dynamic_field: false, consistency_level: 'Strong', fields: collectionFields(dimension, false) }) });
    denseFallbackReason = 'The vector service explicitly reported BM25/analyzer functions unsupported at collection creation.';
   }
   created = true;
  }
  const info = validateCollection(await client.describeCollection({ collection_name: collection, cache: false }), dimension);
  if (info.strategy === 'dense' && !denseFallbackReason) denseFallbackReason = 'The existing compatible collection has no BM25 function; setup does not change existing schemas.';
  const indexes = await client.describeIndex({ collection_name: collection });
  // A new collection can legitimately have no index (IndexNotExist).
  if (!succeeded(indexes.status) && !['IndexNotExist', 700, '700'].includes(indexes.status.error_code) && indexes.status.code !== 700) checkStatus(indexes);
  for (const [field, metric, indexType] of [['embedding', 'COSINE', 'AUTOINDEX'], ...(info.strategy === 'hybrid' ? [['sparse', 'BM25', 'SPARSE_INVERTED_INDEX']] : [])]) {
   const existing = indexes.index_descriptions?.find(index => index.field_name === field);
   if (existing) {
    if (existing.params.find(param => param.key === 'metric_type')?.value !== metric) throw new AppError('VECTOR_INDEX_MISMATCH', 'The collection has an incompatible vector index. Choose a new collection name.', 503, false);
   } else {
    checkStatus({ status: await client.createIndex({ collection_name: collection, field_name: field, index_name: `${field}_index`, index_type: indexType, metric_type: metric }) });
   }
  }
  checkStatus({ status: await client.loadCollectionSync({ collection_name: collection }) });
  return { collection, ...info, created, ...(denseFallbackReason ? { denseFallbackReason } : {}) };
 } catch (error) {
  if (error instanceof AppError) throw error;
  throw new AppError('VECTOR_SETUP_FAILED', 'Vector setup failed. Check server configuration and service availability. No existing collection was deleted.');
 } finally { await client.closeConnection(); }
}

/** Disposable, random-workspace integration probe; never deletes other workspaces or collections. */
export async function verifyVectorStore(): Promise<{ insert: boolean; search: boolean; isolation: boolean; delete: boolean; strategy: 'dense' | 'hybrid' }> {
 const client = createMilvusClient();
 const store = new MilvusVectorStore(client, collectionName());
 const documents = createDocumentService(store, embedTexts);
 const retrieve = createRetrievalService(store, embedTexts, documents.listDocuments);
 const workspaceId = randomUUID();
 const stranger = randomUUID();
 let documentId: string | undefined;
 try {
  const document = await documents.ingestDocument({ workspaceId, name: 'Disposable fictional policy.txt', text: 'Fictional reimbursement policy\nEmployees must get manager approval before requesting reimbursement.\nKeep an itemized receipt for every expense.\nThe policy code is ORCHID-72.' });
  documentId = document.id;
  const listed = await documents.listDocuments(workspaceId);
  if (listed.length !== 1 || listed[0].id !== documentId) throw new Error('insert');
  for (const query of ['ORCHID-72', 'What must an employee do before submitting expenses?']) {
   const passages = await retrieve({ workspaceId, documentIds: [documentId], query });
   if (!passages.some(p => p.excerpt.includes('manager approval'))) throw new Error('search');
  }
  if ((await documents.listDocuments(stranger)).length) throw new Error('isolation');
  const [vector] = await embedTexts(['ORCHID-72']);
  if ((await store.search(stranger, [documentId], vector, 'ORCHID-72')).length) throw new Error('isolation');
  let denied = false;
  try { await retrieve({ workspaceId: stranger, documentIds: [documentId], query: 'ORCHID-72' }); }
  catch (error) { denied = error instanceof AppError && error.code === 'DOCUMENT_NOT_FOUND'; }
  if (!denied) throw new Error('isolation');
  await documents.rollbackDocument(workspaceId, documentId);
  if ((await documents.listDocuments(workspaceId)).length || (await store.queryChunks(workspaceId, [documentId])).length || (await store.search(workspaceId, [documentId], vector, 'ORCHID-72')).length) throw new Error('delete');
  return { insert: true, search: true, isolation: true, delete: true, strategy: (await store.info()).strategy };
 } catch (error) {
  if (error instanceof AppError) throw error;
  throw new AppError('VECTOR_VERIFICATION_FAILED', 'The disposable vector integration check failed.');
 } finally {
  try { if (documentId) await documents.rollbackDocument(workspaceId, documentId); }
  finally { await client.closeConnection(); }
 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 (async () => {
  console.log(JSON.stringify(await setupVectorStore()));
  if (process.argv.includes('--verify')) console.log(JSON.stringify(await verifyVectorStore()));
 })().catch(error => {
  // Never print raw SDK/provider errors, endpoints, credentials, or source contents.
  console.error(JSON.stringify({ error: error instanceof AppError ? error.code : 'VECTOR_SETUP_FAILED', message: error instanceof AppError ? error.message : 'Vector setup failed.' }));
  process.exitCode = 1;
 });
}
