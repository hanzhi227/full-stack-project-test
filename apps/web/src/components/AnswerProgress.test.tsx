import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerProgress } from './AnswerProgress';

test('answer progress starts with an accessible, honestly estimated status', () => {
  const html = renderToStaticMarkup(createElement(AnswerProgress, { question: 'What first?' }));
  assert.match(html, /What first\?/);
  assert.match(html, /answer-mark--pending/);
  assert.match(html, /Thinking through your question…/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Progress shown is approximate/);
});
