import assert from 'node:assert/strict';
import test from 'node:test';
import { citationMatchesSource } from '../evals/citations';
import type { Citation } from '@document-qa/contracts';

const citation: Citation = {
 id: 'chunk', documentId: 'd137d2b3-7eeb-4aeb-b0ea-17f4c887f4a0', documentName: 'Handbook.md',
 excerpt: 'Keep a receipt.\n', startLine: 2, endLine: 2,
};
test('evaluation preserves trailing newline and CRLF in exact source excerpts', () => {
 assert.ok(citationMatchesSource(citation, 'Handbook\nKeep a receipt.\n'));
 assert.ok(citationMatchesSource(citation, 'Handbook\nKeep a receipt.\nNext policy'));
 assert.ok(citationMatchesSource({ ...citation, excerpt: 'Keep a receipt.\r\n' }, 'Handbook\r\nKeep a receipt.\r\n'));
 assert.ok(citationMatchesSource({ ...citation, excerpt: 'Keep a receipt.' }, 'Handbook\nKeep a receipt.'));
 assert.ok(citationMatchesSource({ ...citation, excerpt: 'a receipt.' }, 'Handbook\nKeep a receipt.'));
});
test('evaluation rejects invented excerpts, wrong spans and normalized-but-inexact text', () => {
 const source = 'Handbook\nKeep a receipt.\n';
 for (const invalid of [
  { ...citation, excerpt: 'Approval is optional.' }, { ...citation, excerpt: '' },
  { ...citation, startLine: 1, endLine: 1 }, { ...citation, startLine: 0 },
  { ...citation, startLine: 3, endLine: 2 }, { ...citation, endLine: 99 },
  { ...citation, startLine: 1.5 },
 ]) assert.equal(citationMatchesSource(invalid, source), false);
 assert.equal(citationMatchesSource(citation, 'Handbook\r\nKeep a receipt.\r\n'), false);
});
