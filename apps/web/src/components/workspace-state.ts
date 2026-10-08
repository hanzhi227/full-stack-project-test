import type { AskRequest, AskResponse, DocumentSummary } from '@document-qa/contracts';
import { MAX_DOCUMENTS, MAX_FILE_BYTES } from '@document-qa/contracts';

export type WorkspaceError = { message: string; retryable: boolean };
export type ConversationTurn = { question: string; response: AskResponse };
export type SavedConversation = { id: string; title: string; turns: ConversationTurn[] };
export type StoredConversations = {
  active: { id: string; turns: ConversationTurn[] } | null;
  previous: SavedConversation[];
};
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
  conversationId: string | null;
  turns: ConversationTurn[];
  previousConversations: SavedConversation[];
  announcement: string;
};

export const CONVERSATION_STORAGE_KEY = 'document-qa.conversations';
export const MAX_STORED_CONVERSATIONS = 12;

export const initialWorkspaceState: WorkspaceState = {
  documents: [], selectedIds: [], loadingDocuments: true, listError: null,
  uploadName: null, uploadError: null, question: '', pendingQuestion: null,
  askError: null, conversationId: null, turns: [], previousConversations: [],
  announcement: 'Loading documents…',
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
  if (!/\.(pdf|txt|md)$/i.test(file.name)) return 'Choose a PDF, TXT or Markdown (.md) file.';
  if (file.size === 0) return 'This file is empty. Choose a document with text.';
  if (file.size > MAX_FILE_BYTES) return 'This file exceeds 50 MB. Choose a smaller document.';
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
  | { type: 'reset' }
  | { type: 'open-conversation'; id: string }
  | { type: 'assign-conversation-id' }
  | { type: 'restore-conversations'; active: StoredConversations['active']; previous: SavedConversation[] };

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
        conversationId: state.conversationId ?? crypto.randomUUID(),
        turns: [...state.turns, { question: state.pendingQuestion, response: action.response }].slice(-3),
        announcement: `${answerStatusLabels[action.response.status]}. ${action.response.citations.length} sources available.` };
    case 'ask-failed':
      return { ...state, pendingQuestion: null, askError: action.error, announcement: action.error.message };
    case 'reset':
      return { ...state, ...blankConversation(), previousConversations: archiveActive(state),
        announcement: state.turns.length
          ? 'Started a new conversation. The previous one stays in this browser.'
          : 'Conversation cleared. Your documents are still available.' };
    case 'open-conversation': {
      if (state.pendingQuestion !== null) return state;
      const selected = state.previousConversations.find(conversation => conversation.id === action.id);
      if (!selected) return state;
      return {
        ...state,
        ...blankConversation(),
        conversationId: selected.id,
        turns: selected.turns,
        previousConversations: archiveActive(state).filter(conversation => conversation.id !== selected.id),
        announcement: 'Opened a previous conversation.',
      };
    }
    case 'assign-conversation-id':
      if (state.conversationId || state.turns.length === 0) return state;
      return { ...state, conversationId: crypto.randomUUID() };
    case 'restore-conversations':
      return {
        ...state,
        conversationId: action.active?.id ?? null,
        turns: action.active?.turns ?? [],
        previousConversations: action.previous,
        announcement: action.active ? 'Restored your last conversation.' : state.announcement,
      };
  }
}

function conversationTitle(turns: ConversationTurn[]): string {
  const question = turns[0]?.question.replace(/\s+/g, ' ').trim() || 'Conversation';
  return question.length > 72 ? `${question.slice(0, 69)}…` : question;
}

function archiveActive(state: WorkspaceState): SavedConversation[] {
  if (state.turns.length === 0) return state.previousConversations;
  const saved: SavedConversation = {
    id: state.conversationId ?? crypto.randomUUID(),
    title: conversationTitle(state.turns),
    turns: state.turns,
  };
  return [saved, ...state.previousConversations.filter(conversation => conversation.id !== saved.id)]
    .slice(0, MAX_STORED_CONVERSATIONS);
}

function blankConversation(): Pick<WorkspaceState, 'conversationId' | 'turns' | 'question' | 'pendingQuestion' | 'askError'> {
  return { conversationId: null, turns: [], question: '', pendingQuestion: null, askError: null };
}

const answerStatuses = new Set<AskResponse['status']>(['answered', 'needs_clarification', 'insufficient_evidence', 'blocked']);

function isTurn(value: unknown): value is ConversationTurn {
  if (!value || typeof value !== 'object') return false;
  const turn = value as ConversationTurn;
  const response = turn.response;
  return typeof turn.question === 'string' && turn.question.trim().length > 0 && turn.question.length <= 2000
    && !!response && answerStatuses.has(response.status) && typeof response.answer === 'string' && typeof response.requestId === 'string'
    && Array.isArray(response.citations) && response.citations.every(citation => !!citation
      && typeof citation.id === 'string' && typeof citation.documentId === 'string' && typeof citation.documentName === 'string'
      && typeof citation.excerpt === 'string' && Number.isInteger(citation.startLine) && citation.startLine > 0
      && Number.isInteger(citation.endLine) && citation.endLine > 0);
}

function parseTurns(value: unknown): ConversationTurn[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 3 || !value.every(isTurn)) return null;
  return value;
}

function parseSavedConversation(value: unknown): SavedConversation | null {
  if (!value || typeof value !== 'object') return null;
  const conversation = value as SavedConversation;
  const turns = parseTurns(conversation.turns);
  if (typeof conversation.id !== 'string' || conversation.id.length === 0 || conversation.id.length > 80 || !turns) return null;
  return { id: conversation.id, title: conversationTitle(turns), turns };
}

export function snapshotConversations(state: Pick<WorkspaceState, 'conversationId' | 'turns' | 'previousConversations'>): StoredConversations {
  const active = state.conversationId && state.turns.length > 0 ? { id: state.conversationId, turns: state.turns } : null;
  return {
    active,
    previous: state.previousConversations.filter(conversation => conversation.id !== active?.id).slice(0, MAX_STORED_CONVERSATIONS),
  };
}

export function parseStoredConversations(raw: string): StoredConversations | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return null;
    const record = value as { active?: { id?: unknown; turns?: unknown } | null; previous?: unknown };
    const activeTurns = record.active ? parseTurns(record.active.turns) : null;
    const active = record.active && typeof record.active.id === 'string' && record.active.id.length > 0 && activeTurns
      ? { id: record.active.id, turns: activeTurns }
      : null;
    const previous = Array.isArray(record.previous)
      ? record.previous.flatMap(item => {
        const saved = parseSavedConversation(item);
        return saved && saved.id !== active?.id ? [saved] : [];
      }).slice(0, MAX_STORED_CONVERSATIONS)
      : [];
    return { active, previous };
  } catch {
    return null;
  }
}

export function readBrowserConversations(): { ok: true; data: StoredConversations | null } | { ok: false } {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return { ok: true, data: null };
    const raw = storage.getItem(CONVERSATION_STORAGE_KEY);
    return { ok: true, data: raw ? parseStoredConversations(raw) : null };
  } catch {
    return { ok: false };
  }
}

export function writeBrowserConversations(snapshot: StoredConversations): void {
  try {
    globalThis.localStorage?.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({ version: 1, ...snapshot }));
  } catch {
    // A full or blocked browser store leaves the conversation available for this visit.
  }
}
