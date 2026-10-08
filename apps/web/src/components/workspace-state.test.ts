import assert from 'node:assert/strict';
import test from 'node:test';
import type { AskResponse, DocumentSummary } from '@document-qa/contracts';
import {
  answerStatusLabels, conversationHistory, CONVERSATION_STORAGE_KEY, initialWorkspaceState,
  parseStoredConversations, readBrowserConversations, snapshotConversations, validateUpload,
  workspaceReducer, writeBrowserConversations,
} from './workspace-state';
import type { WorkspaceState } from './workspace-state';

const first: DocumentSummary = { id: 'document-1', name: 'Handbook.md', chunkCount: 4 };
const second: DocumentSummary = { id: 'document-2', name: 'Guide.txt', chunkCount: 1 };
const response: AskResponse = { status: 'answered', answer: 'Get approval first.', citations: [], requestId: 'request-1' };
const error = { message: 'Provider unavailable. Try again.', retryable: true };
const ready = (): WorkspaceState => workspaceReducer(initialWorkspaceState, { type: 'list-loaded', documents: [first] });

function answered(state: WorkspaceState, question: string, result = response): WorkspaceState {
  return workspaceReducer(workspaceReducer(state, { type: 'ask-start', question }), { type: 'ask-succeeded', response: result });
}

test('GET results restore indexed documents and select them in the workspace', () => {
  const state = ready();
  assert.deepEqual(state.documents, [first]);
  assert.deepEqual(state.selectedIds, [first.id]);
  assert.equal(state.loadingDocuments, false);
  assert.equal(state.announcement, 'Documents ready.');
});

test('empty GET and failed GET have distinct recoverable states', () => {
  const empty = workspaceReducer(initialWorkspaceState, { type: 'list-loaded', documents: [] });
  assert.equal(empty.announcement, 'Add a document to get started.');
  const failed = workspaceReducer(initialWorkspaceState, { type: 'list-failed', error });
  assert.equal(failed.loadingDocuments, false);
  assert.deepEqual(failed.listError, error);
  const retrying = workspaceReducer(failed, { type: 'list-start' });
  assert.equal(retrying.loadingDocuments, true);
  assert.equal(retrying.listError, null);
});

test('upload remains unselectable while indexing, then adds and selects the indexed document', () => {
  const indexing = workspaceReducer(ready(), { type: 'upload-start', name: second.name });
  assert.equal(indexing.announcement, 'Indexing document…');
  assert.deepEqual(indexing.documents, [first]);
  assert.deepEqual(indexing.selectedIds, [first.id]);
  const uploaded = workspaceReducer(indexing, { type: 'upload-succeeded', document: second });
  assert.equal(uploaded.uploadName, null);
  assert.deepEqual(uploaded.documents, [first, second]);
  assert.deepEqual(uploaded.selectedIds, [first.id, second.id]);
});

test('failed upload does not add a document; retry success does not duplicate IDs', () => {
  const failed = workspaceReducer(ready(), { type: 'upload-failed', error });
  assert.deepEqual(failed.documents, [first]);
  assert.equal(failed.uploadName, null);
  assert.deepEqual(failed.uploadError, error);
  const uploaded = workspaceReducer(failed, { type: 'upload-succeeded', document: first });
  assert.deepEqual(uploaded.documents, [first]);
  assert.deepEqual(uploaded.selectedIds, [first.id]);
  assert.equal(uploaded.uploadError, null);
});

test('checkboxes change the selected subset and ignore unknown documents', () => {
  const unselected = workspaceReducer(ready(), { type: 'toggle-document', id: first.id });
  assert.deepEqual(unselected.selectedIds, []);
  assert.deepEqual(workspaceReducer(unselected, { type: 'toggle-document', id: first.id }).selectedIds, [first.id]);
  assert.equal(workspaceReducer(unselected, { type: 'toggle-document', id: 'unknown' }), unselected);
});

test('answer failure preserves exact input and prior conversation for Try again', () => {
  const previous = answered(ready(), 'First question');
  const typed = workspaceReducer(previous, { type: 'question-changed', question: '  Follow-up?  ' });
  const pending = workspaceReducer(typed, { type: 'ask-start', question: 'Follow-up?' });
  assert.equal(pending.announcement, 'Finding an answer…');
  const failed = workspaceReducer(pending, { type: 'ask-failed', error });
  assert.equal(failed.question, '  Follow-up?  ');
  assert.equal(failed.pendingQuestion, null);
  assert.deepEqual(failed.turns, previous.turns);
  assert.deepEqual(failed.askError, error);
  const retried = workspaceReducer(failed, { type: 'ask-start', question: failed.question.trim() });
  assert.equal(retried.askError, null);
  const completed = workspaceReducer(retried, { type: 'ask-succeeded', response });
  assert.equal(completed.question, '');
  assert.equal(completed.turns[1].question, 'Follow-up?');
});

test('each answer status is retained and announced without turning abstentions into failures', () => {
  for (const status of Object.keys(answerStatusLabels) as AskResponse['status'][]) {
    const state = answered(ready(), 'Question', { ...response, status });
    assert.equal(state.turns[0].response.status, status);
    assert.equal(state.askError, null);
    assert.equal(state.announcement, `${answerStatusLabels[status]}. 0 sources available.`);
  }
});

test('conversation UI and outgoing history retain at most six recent messages', () => {
  let state = ready();
  for (let index = 1; index <= 5; index++) {
    state = answered(state, `Question ${index}`, { ...response, answer: `Answer ${index}` });
  }
  assert.equal(state.turns.length, 3);
  assert.deepEqual(conversationHistory(state.turns), [
    { role: 'user', content: 'Question 3' }, { role: 'assistant', content: 'Answer 3' },
    { role: 'user', content: 'Question 4' }, { role: 'assistant', content: 'Answer 4' },
    { role: 'user', content: 'Question 5' }, { role: 'assistant', content: 'Answer 5' },
  ]);
});

test('history satisfies frozen message bounds even for empty or unusually long answers', () => {
  const state = answered(answered(ready(), 'First', { ...response, answer: '' }), 'Second', { ...response, answer: 'a'.repeat(9000) });
  const history = conversationHistory(state.turns);
  assert.equal(history.length, 3);
  assert.equal(history[2].content.length, 8000);
  assert.ok(history.every(message => message.content.length > 0 && message.content.length <= 8000));
});

test('Start new conversation archives the current one without losing documents or selection', () => {
  const before = workspaceReducer(answered(ready(), 'Question'), { type: 'question-changed', question: 'Draft' });
  const reset = workspaceReducer(before, { type: 'reset' });
  assert.deepEqual(reset.documents, before.documents);
  assert.deepEqual(reset.selectedIds, before.selectedIds);
  assert.deepEqual(reset.turns, []);
  assert.equal(reset.conversationId, null);
  assert.deepEqual(conversationHistory(reset.turns), []);
  assert.equal(reset.question, '');
  assert.equal(reset.askError, null);
  assert.equal(reset.previousConversations.length, 1);
  assert.equal(reset.previousConversations[0].title, 'Question');
  assert.deepEqual(reset.previousConversations[0].turns, before.turns);
  assert.equal(reset.announcement, 'Started a new conversation. The previous one stays in this browser.');
  const empty = workspaceReducer(reset, { type: 'reset' });
  assert.equal(empty.previousConversations.length, 1);
  assert.equal(empty.announcement, 'Conversation cleared. Your documents are still available.');
});

test('previous conversations can be reopened and replace one another', () => {
  const first = workspaceReducer(answered(ready(), 'First question'), { type: 'reset' });
  const second = answered(first, 'Second question');
  const reopened = workspaceReducer(second, { type: 'open-conversation', id: first.previousConversations[0].id });
  assert.equal(reopened.turns[0].question, 'First question');
  assert.equal(reopened.conversationId, first.previousConversations[0].id);
  assert.deepEqual(reopened.previousConversations.map(conversation => conversation.title), ['Second question']);
  assert.equal(conversationHistory(reopened.turns)[0].content, 'First question');
  const continued = workspaceReducer(answered(reopened, 'Follow-up on the first'), { type: 'reset' });
  assert.deepEqual(continued.previousConversations.map(conversation => conversation.turns.length), [2, 1]);
  assert.equal(continued.previousConversations.filter(conversation => conversation.title === 'First question').length, 1);
  const pending = workspaceReducer(reopened, { type: 'ask-start', question: 'Wait' });
  assert.equal(workspaceReducer(pending, { type: 'open-conversation', id: reopened.previousConversations[0].id }), pending);
  assert.equal(workspaceReducer(reopened, { type: 'open-conversation', id: 'missing' }), reopened);
});

test('a visible conversation without an id receives one before it can be stored', () => {
  const unsaved = { ...answered(ready(), 'Question'), conversationId: null };
  assert.equal(snapshotConversations(unsaved).active, null);
  const assigned = workspaceReducer(unsaved, { type: 'assign-conversation-id' });
  assert.equal(typeof assigned.conversationId, 'string');
  assert.equal(snapshotConversations(assigned).active?.turns[0].question, 'Question');
  assert.equal(workspaceReducer(assigned, { type: 'assign-conversation-id' }), assigned);
});

test('only the twelve most recent conversations stay in browser storage', () => {
  let state = ready();
  for (let index = 0; index < 13; index += 1) state = workspaceReducer(answered(state, `Question ${index}`), { type: 'reset' });
  assert.equal(state.previousConversations.length, 12);
  assert.equal(state.previousConversations[0].title, 'Question 12');
  assert.equal(state.previousConversations.at(-1)?.title, 'Question 1');
  const active = answered(state, 'What is the deadline?');
  const memory = new Map<string, string>();
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
  } as Storage;
  try {
    writeBrowserConversations(snapshotConversations(active));
    const stored = readBrowserConversations();
    assert.equal(stored.ok, true);
    if (!stored.ok || !stored.data?.active) throw new Error('Expected a stored conversation');
    assert.equal(stored.data.active.turns[0].question, 'What is the deadline?');
    assert.equal(stored.data.previous.length, 12);
    assert.equal(memory.has(CONVERSATION_STORAGE_KEY), true);
    assert.deepEqual(parseStoredConversations('{"version":1,"active":{"id":"x","turns":[]},"previous":[]}'), { active: null, previous: [] });
    assert.equal(parseStoredConversations('{"version":2}'), null);
    assert.equal(parseStoredConversations('not-json'), null);
  } finally {
    globalThis.localStorage = original;
  }
});

test('upload validation enforces PDF/TXT/Markdown, 50 MB and five-document contract', () => {
  assert.equal(validateUpload({ name: 'Handbook.MD', size: 1_000_000 }, 4), null);
  assert.equal(validateUpload({ name: 'Guide.txt', size: 1 }, 0), null);
  assert.equal(validateUpload({ name: 'Guide.PDF', size: 50_000_000 }, 0), null);
  assert.match(validateUpload({ name: 'Guide.docx', size: 10 }, 0)!, /PDF, TXT or Markdown/);
  assert.match(validateUpload({ name: 'Guide.txt', size: 0 }, 0)!, /empty/);
  assert.match(validateUpload({ name: 'Guide.txt', size: 50_000_001 }, 0)!, /exceeds 50 MB/);
  assert.match(validateUpload({ name: 'Guide.txt', size: 10 }, 5)!, /5 documents/);
});
