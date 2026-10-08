import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AskResponse } from '@document-qa/contracts';
import { Answer } from './Answer';
import { answerStatusLabels } from './workspace-state';

const response: AskResponse = {
  status: 'answered', answer: 'Ask for approval before reimbursement.', requestId: 'request-1',
  citations: [{ id: 'chunk-1', documentId: 'document-1', documentName: 'Handbook.md',
    excerpt: 'Before requesting reimbursement:\n  Obtain approval.\nKeep <all> receipts.', startLine: 12, endLine: 14 }],
};

test('sources are keyboard-native disclosures with document, exact lines and escaped exact excerpt', () => {
  const html = renderToStaticMarkup(createElement(Answer, { turn: { question: 'What first?', response } }));
  assert.match(html, /<h4>Sources<\/h4>/);
  assert.match(html, /<details class="source"><summary>/);
  assert.match(html, /Handbook\.md/);
  assert.match(html, /Lines 12–14/);
  assert.match(html, /Before requesting reimbursement:\n  Obtain approval\.\nKeep &lt;all&gt; receipts\./);
  assert.doesNotMatch(html, /<details[^>]* open/);
});

test('all contract result statuses render readable labels and answer text', () => {
  for (const status of Object.keys(answerStatusLabels) as AskResponse['status'][]) {
    const html = renderToStaticMarkup(createElement(Answer, { turn: {
      question: 'Question', response: { ...response, status, citations: [] },
    } }));
    assert.ok(html.includes(answerStatusLabels[status]));
    assert.ok(html.includes(response.answer));
    assert.doesNotMatch(html, /<details|<h4>Sources/);
  }
});
