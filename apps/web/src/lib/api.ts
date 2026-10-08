import type { AskRequest, AskResponse, DocumentSummary, ApiError } from '@document-qa/contracts';
export class ApiClientError extends Error { constructor(public data: ApiError) { super(data.error.message); } }
async function json<T>(response: Response): Promise<T> {
 const data = await response.json();
 if (!response.ok) throw new ApiClientError(data as ApiError);
 return data as T;
}
export const api = {
 listDocuments: async () => json<{ documents: DocumentSummary[] }>(await fetch('/api/documents', { cache: 'no-store' })),
 uploadDocument: async (file: File) => { const body = new FormData(); body.set('file', file); return json<{ document: DocumentSummary }>(await fetch('/api/documents', { method: 'POST', body })); },
 ask: async (request: AskRequest) => json<AskResponse>(await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }))
};
