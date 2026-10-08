import type { AskRequest, AskResponse, DocumentSummary } from '@/contracts';
import { MAX_DOCUMENTS, MAX_FILE_BYTES } from '@/contracts';

export type WorkspaceError = { message: string; retryable: boolean };
export type ConversationTurn = { question: string; response: AskResponse };
export type WorkspaceState = {
  documents: DocumentSummary[];
  selectedIds: string[];
  loadingDocuments: boolean;
  listError: WorkspaceError | null;
  uploadName: string | null;
  uploadError: WorkspaceError | null;
  question: string;
  pendingQuestion: string | null;
  askError: WorkspaceError | null;
  turns: ConversationTurn[];
  announcement: string;
};

export const initialWorkspaceState: WorkspaceState = {
  documents: [], selectedIds: [], loadingDocuments: true, listError: null,
  uploadName: null, uploadError: null, question: '', pendingQuestion: null,
  askError: null, turns: [], announcement: 'Loading documents…',
};

export const answerStatusLabels: Record<AskResponse['status'], string> = {
  answered: 'Answered',
  needs_clarification: 'Needs clarification',
  insufficient_evidence: 'Insufficient evidence',
  blocked: 'Blocked',
};

export function conversationHistory(turns: ConversationTurn[]): AskRequest['history'] {
  return turns.flatMap(turn => [
    { role: 'user' as const, content: turn.question },
    { role: 'assistant' as const, content: turn.response.answer },
  ]).filter(message => message.content.trim().length > 0)
    .map(message => ({ ...message, content: message.content.slice(0, 8000) }))
    .slice(-6);
}

export function validateUpload(file: Pick<File, 'name' | 'size'>, count: number): string | null {
  if (count >= MAX_DOCUMENTS) return 'This workspace has 5 documents. Select an existing document to ask a question.';
  if (!/\.(txt|md)$/i.test(file.name)) return 'Choose a TXT or Markdown (.md) file.';
  if (file.size === 0) return 'This file is empty. Choose a document with text.';
  if (file.size > MAX_FILE_BYTES) return 'This file exceeds 1 MB. Choose a smaller document.';
  return null;
}

export type WorkspaceAction =
  | { type: 'list-start' }
  | { type: 'list-loaded'; documents: DocumentSummary[] }
  | { type: 'list-failed'; error: WorkspaceError }
  | { type: 'upload-start'; name: string }
  | { type: 'upload-succeeded'; document: DocumentSummary }
  | { type: 'upload-failed'; error: WorkspaceError }
  | { type: 'toggle-document'; id: string }
  | { type: 'question-changed'; question: string }
  | { type: 'ask-start'; question: string }
  | { type: 'ask-succeeded'; response: AskResponse }
  | { type: 'ask-failed'; error: WorkspaceError }
  | { type: 'reset' };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'list-start':
      return { ...state, loadingDocuments: true, listError: null, announcement: 'Loading documents…' };
    case 'list-loaded':
      return { ...state, loadingDocuments: false, documents: action.documents,
        selectedIds: action.documents.map(document => document.id), listError: null,
        announcement: action.documents.length ? 'Documents ready.' : 'Add a document to get started.' };
    case 'list-failed':
      return { ...state, loadingDocuments: false, listError: action.error, announcement: action.error.message };
    case 'upload-start':
      return { ...state, uploadName: action.name, uploadError: null, announcement: 'Indexing document…' };
    case 'upload-succeeded':
      return { ...state, uploadName: null, uploadError: null,
        documents: [...state.documents.filter(document => document.id !== action.document.id), action.document],
        selectedIds: [...new Set([...state.selectedIds, action.document.id])],
        announcement: `${action.document.name} is indexed and selected.` };
    case 'upload-failed':
      return { ...state, uploadName: null, uploadError: action.error, announcement: action.error.message };
    case 'toggle-document':
      if (!state.documents.some(document => document.id === action.id)) return state;
      return { ...state, selectedIds: state.selectedIds.includes(action.id)
        ? state.selectedIds.filter(id => id !== action.id) : [...state.selectedIds, action.id] };
    case 'question-changed':
      return { ...state, question: action.question, askError: null };
    case 'ask-start':
      return { ...state, pendingQuestion: action.question, askError: null, announcement: 'Finding an answer…' };
    case 'ask-succeeded':
      if (state.pendingQuestion === null) return state;
      return { ...state, pendingQuestion: null, question: '', askError: null,
        turns: [...state.turns, { question: state.pendingQuestion, response: action.response }].slice(-3),
        announcement: `${answerStatusLabels[action.response.status]}. ${action.response.citations.length} sources available.` };
    case 'ask-failed':
      return { ...state, pendingQuestion: null, askError: action.error, announcement: action.error.message };
    case 'reset':
      return { ...state, turns: [], question: '', pendingQuestion: null, askError: null,
        announcement: 'Conversation cleared. Your documents are still available.' };
  }
}
