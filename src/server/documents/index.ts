import type { DocumentSummary, IngestInput } from '@/contracts';
export async function ingestDocument(_input: IngestInput): Promise<DocumentSummary> { throw new Error('Data lane pending'); }
export async function listDocuments(_workspaceId: string): Promise<DocumentSummary[]> { throw new Error('Data lane pending'); }
