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

test('sources are keyboard-native disclosures with the document and escaped exact excerpt', () => {
  const html = renderToStaticMarkup(createElement(Answer, { turn: { question: 'What first?', response } }));
  assert.match(html, /aria-label="Sources"/);
  assert.match(html, /<details class="source" name="sources-request-1"><summary>/);
  assert.match(html, /Handbook\.md/);
  assert.doesNotMatch(html, /Lines 12/);
  assert.match(html, /<blockquote[^>]*>Before requesting reimbursement:\n  Obtain approval\.\nKeep &lt;all&gt; receipts\.<\/blockquote>/);
  assert.doesNotMatch(html, /<details[^>]* open/);
});

test('passages from one document share its name, and each other document is named once', () => {
  const html = renderToStaticMarkup(createElement(Answer, { turn: { question: 'What first?', response: {
    ...response,
    citations: [
      response.citations[0],
      { ...response.citations[0], id: 'chunk-2', startLine: 60, endLine: 87 },
      { ...response.citations[0], id: 'chunk-3', documentId: 'document-2', documentName: 'Policy.md', startLine: 1, endLine: 4 },
    ],
  } } }));
  assert.equal(html.match(/Handbook\.md/g)?.length, 1);
  assert.equal(html.match(/Policy\.md/g)?.length, 1);
  assert.doesNotMatch(html, /Lines 60|Lines 1/);
  assert.equal(html.match(/name="sources-request-1"/g)?.length, 2);
  assert.match(html, /2 passages/);
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
