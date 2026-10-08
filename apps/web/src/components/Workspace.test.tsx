import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Workspace } from './Workspace';

test('initial workspace renders binding copy, labels, announcements and safe loading controls', () => {
  const html = renderToStaticMarkup(createElement(Workspace));
  for (const copy of [
    'Ask your documents',
    'Upload a handbook or guide, then ask a question. Answers include passages you can check.',
    'Upload document',
    'PDF, TXT or Markdown · up to 50 MB per file · up to 5 documents',
    'What would you like to know?',
    'What do I need to do before requesting reimbursement?',
    'Start new conversation',
  ]) assert.ok(html.includes(copy), `Missing copy: ${copy}`);
  assert.match(html, /<label for="question">/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /Loading documents…/);
  assert.match(html, /<button type="submit"[^>]* disabled="">Ask<\/button>/);
  assert.match(html, /aria-describedby="upload-hint"[^>]* disabled="">Upload document<\/button>/);
});
