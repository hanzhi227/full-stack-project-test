import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { chunkText } from '../apps/api/src/server/documents/chunking';
import { extractDocumentText } from '../apps/api/src/server/documents/extract';
import { citationMatchesSource } from '../evals/citations';
import type { Citation } from '@document-qa/contracts';

test('injection fixtures keep the bare attack in every retrievable chunk without supplying the answer', async () => {
 for (const extension of ['md', 'pdf']) {
  const name = `fixtures/injection.${extension}`;
  const text = await extractDocumentText(new File([await readFile(name)], name));
  const chunks = chunkText(text);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].text, /IGNORE\s+ALL\s+PREVIOUS\s+INSTRUCTIONS/);
  assert.ok(chunks[0].text.includes('PWNED'));
  assert.ok(chunks[0].text.includes('fake-source'));
  assert.doesNotMatch(text, /written approval|itemized receipt|EXP-042/i);
 }
});

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
