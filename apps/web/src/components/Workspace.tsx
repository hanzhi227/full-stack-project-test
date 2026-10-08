'use client';

import React, { useEffect, useReducer, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { MAX_DOCUMENTS } from '@document-qa/contracts';
import { api, ApiClientError } from '@/lib/api';
import { Answer } from './Answer';
import {
  conversationHistory, initialWorkspaceState, validateUpload, workspaceReducer,
} from './workspace-state';
import type { WorkspaceError } from './workspace-state';

function errorDetails(error: unknown, fallback: string): WorkspaceError {
  return error instanceof ApiClientError
    ? { message: error.data.error.message, retryable: error.data.error.retryable }
    : { message: fallback, retryable: true };
}

function ErrorNotice({ error, onRetry, disabled = false }: {
  error: WorkspaceError; onRetry: () => void; disabled?: boolean;
}) {
  return (
    <div className="error-notice">
      <p>{error.message}</p>
      {error.retryable && <button type="button" className="button button-secondary" onClick={onRetry} disabled={disabled}>Try again</button>}
    </div>
  );
}

export function Workspace() {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const fileInput = useRef<HTMLInputElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const failedFile = useRef<File | null>(null);
  // A synchronous lock closes the gap before React renders disabled controls.
  const operationInFlight = useRef(false);
  const listInFlight = useRef(false);
  const busy = state.uploadName !== null || state.pendingQuestion !== null;
  const documentsUnavailable = state.loadingDocuments || state.listError !== null;
  const canAsk = !busy && !documentsUnavailable && state.selectedIds.length > 0 && state.question.trim().length > 0;
  const hasConversation = state.turns.length > 0 || state.pendingQuestion !== null || state.askError !== null;

  useEffect(() => {
    let active = true;
    api.listDocuments().then(({ documents }) => {
      if (active) dispatch({ type: 'list-loaded', documents });
    }).catch((error: unknown) => {
      if (active) dispatch({ type: 'list-failed', error: errorDetails(error, 'Could not load your documents. Try again.') });
    });
    return () => { active = false; };
  }, []);

  async function retryList() {
    if (listInFlight.current) return;
    listInFlight.current = true;
    dispatch({ type: 'list-start' });
    try {
      const { documents } = await api.listDocuments();
      dispatch({ type: 'list-loaded', documents });
    } catch (error) {
      dispatch({ type: 'list-failed', error: errorDetails(error, 'Could not load your documents. Try again.') });
    } finally {
      listInFlight.current = false;
    }
  }

  async function upload(file: File) {
    if (operationInFlight.current || documentsUnavailable) return;
    const validationError = validateUpload(file, state.documents.length);
    if (validationError) {
      failedFile.current = null;
      dispatch({ type: 'upload-failed', error: { message: validationError, retryable: false } });
      return;
    }
    operationInFlight.current = true;
    failedFile.current = file;
    dispatch({ type: 'upload-start', name: file.name });
    try {
      const { document } = await api.uploadDocument(file);
      dispatch({ type: 'upload-succeeded', document });
      failedFile.current = null;
    } catch (error) {
      dispatch({ type: 'upload-failed', error: errorDetails(error, 'Could not index this document. Try again.') });
    } finally {
      operationInFlight.current = false;
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void upload(file);
  }

  async function ask() {
    if (operationInFlight.current || !canAsk) return;
    operationInFlight.current = true;
    const question = state.question.trim();
    dispatch({ type: 'ask-start', question });
    try {
      const response = await api.ask({
        question, documentIds: state.selectedIds, history: conversationHistory(state.turns),
      });
      dispatch({ type: 'ask-succeeded', response });
    } catch (error) {
      dispatch({ type: 'ask-failed', error: errorDetails(error, 'Could not find an answer. Your question is saved. Try again.') });
    } finally {
      operationInFlight.current = false;
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask();
  }

  function resetConversation() {
    if (operationInFlight.current) return;
    dispatch({ type: 'reset' });
    questionInput.current?.focus();
  }

  return (
    <main className="workspace">
      <aside className="binder-spine" aria-hidden="true">
        <div className="binder-rings">
          <span /><span /><span />
        </div>
      </aside>

      <div className="binder-page">
        <section className="source-stage" aria-label="Answers and sources">
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{state.announcement}</p>

          {!hasConversation && (
            <div className="source-stage-empty">
              <p>Answers appear here with the exact passages you can check.</p>
            </div>
          )}

          {state.pendingQuestion !== null && (
            <p className="operation-notice" aria-busy="true">Finding an answer…</p>
          )}
          {state.askError && <ErrorNotice error={state.askError} disabled={!canAsk} onRetry={() => void ask()} />}

          {state.turns.length > 0 && (
            <div className="conversation" aria-label="Recent questions and answers">
              {state.turns.map((turn, index) => (
                <Answer key={`${turn.response.requestId}-${index}`} turn={turn} />
              ))}
              <p className="helper-text history-note">
                Only the last six messages are kept in this conversation. Starting a new conversation keeps your documents.
              </p>
            </div>
          )}
        </section>

        <section className="ask-rail" aria-labelledby="question-heading">
          <header className="ask-rail__header">
            <h1 className="ask-rail__title" id="workspace-title">Ask your documents</h1>
            <p className="ask-rail__lede">
              Upload a handbook or guide, then ask a question. Answers include passages you can check.
            </p>
            <button
              type="button"
              className="button button-text ask-rail__reset"
              disabled={busy || (!state.turns.length && !state.question && !state.askError)}
              onClick={resetConversation}
            >
              Start new conversation
            </button>
          </header>

          <div aria-labelledby="documents-heading">
            <h2 className="sr-only" id="documents-heading">Documents</h2>
            <input
              ref={fileInput}
              className="sr-only"
              id="document-upload"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              aria-label="Upload document"
              aria-describedby="upload-hint"
              tabIndex={-1}
              disabled={busy || documentsUnavailable || state.documents.length >= MAX_DOCUMENTS}
              onChange={chooseFile}
            />
            <button
              type="button"
              className="button button-primary upload-button"
              aria-describedby="upload-hint"
              onClick={() => fileInput.current?.click()}
              disabled={busy || documentsUnavailable || state.documents.length >= MAX_DOCUMENTS}
            >
              Upload document
            </button>
            <p className="helper-text" id="upload-hint">TXT or Markdown · up to 1 MB per file · up to 5 documents</p>

            {state.loadingDocuments && <p className="loading-text">Loading documents…</p>}
            {state.listError && (
              <ErrorNotice error={state.listError} onRetry={() => void retryList()} disabled={state.loadingDocuments} />
            )}
            {!documentsUnavailable && state.documents.length === 0 && (
              <p className="empty-documents">Add a document to get started.</p>
            )}
            {state.documents.length > 0 && (
              <fieldset className="document-selection" disabled={busy || documentsUnavailable}>
                <legend>Select documents to use</legend>
                {state.documents.map(document => (
                  <label className="document-row" key={document.id}>
                    <input
                      type="checkbox"
                      checked={state.selectedIds.includes(document.id)}
                      onChange={() => dispatch({ type: 'toggle-document', id: document.id })}
                    />
                    <span>
                      <span className="document-name">{document.name}</span>
                      <span className="document-meta">
                        Indexed · {document.chunkCount} {document.chunkCount === 1 ? 'passage' : 'passages'}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {state.documents.length >= MAX_DOCUMENTS && (
              <p className="helper-text">Document limit reached. You can ask questions using the documents above.</p>
            )}
            {state.uploadName !== null && (
              <div className="operation-notice" aria-busy="true">
                <p>Indexing document…</p>
                <p className="helper-text upload-name">{state.uploadName}</p>
              </div>
            )}
            {state.uploadError && (
              <ErrorNotice
                error={state.uploadError}
                disabled={busy}
                onRetry={() => { if (failedFile.current) void upload(failedFile.current); }}
              />
            )}
          </div>

          <form onSubmit={submitQuestion} className="question-form" aria-busy={state.pendingQuestion !== null}>
            <h2 className="sr-only" id="question-heading">Conversation</h2>
            <label htmlFor="question">What would you like to know?</label>
            <textarea
              ref={questionInput}
              id="question"
              name="question"
              rows={4}
              maxLength={2000}
              value={state.question}
              placeholder="What do I need to do before requesting reimbursement?"
              aria-describedby="question-hint"
              disabled={busy}
              onChange={event => dispatch({ type: 'question-changed', question: event.target.value })}
            />
            <div className="question-actions">
              <p id="question-hint" className="helper-text">
                {state.selectedIds.length
                  ? `${state.selectedIds.length} ${state.selectedIds.length === 1 ? 'document' : 'documents'} selected`
                  : 'Select at least one indexed document to ask a question.'}
              </p>
              <button type="submit" className="button button-primary" disabled={!canAsk}>Ask</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
