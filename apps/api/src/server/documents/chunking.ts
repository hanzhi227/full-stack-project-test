import { AppError } from '../errors';

// Character approximation of 800 tokens / 120 overlap; no provider tokenizer is assumed.
export const CHUNK_CHARACTERS = 3200;
export const CHUNK_OVERLAP = 480;
export const MAX_CHUNKS = 512;
export type TextChunk = { text: string; startLine: number; endLine: number; chunkIndex: number };

/** Keep exact source slices (including whitespace) so line spans and citations are verifiable. */
export function chunkText(text: string): TextChunk[] {
 if (!text.trim()) throw new AppError('EMPTY_DOCUMENT', 'The document contains no text.', 400, false);
 const lineStarts = [0];
 for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
 const lineAt = (offset: number) => {
  let lo = 0, hi = lineStarts.length;
  while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid; }
  return lo + 1;
 };
 const chunks: TextChunk[] = [];
 for (let start = 0; start < text.length;) {
  let end = Math.min(start + CHUNK_CHARACTERS, text.length);
  if (end < text.length) {
   // At least 2080 characters of progress keeps any 1 MB file under the chunk cap.
   const minimum = start + Math.floor(CHUNK_CHARACTERS * 0.8);
   // Prefer paragraph/heading boundaries, then lines, then words.
   const tail = text.slice(minimum, end);
   for (const separator of ['\n\n', '\n', ' ']) {
    const boundary = tail.lastIndexOf(separator);
    if (boundary >= 0) { end = minimum + boundary + separator.length; break; }
   }
   // Never cut a UTF-16 surrogate pair.
   if (/[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
  }
  const slice = text.slice(start, end);
  if (slice.trim()) chunks.push({ text: slice, startLine: lineAt(start), endLine: lineAt(end - 1), chunkIndex: chunks.length });
  if (chunks.length > MAX_CHUNKS) throw new AppError('DOCUMENT_TOO_COMPLEX', `The document exceeds ${MAX_CHUNKS} chunks. Split it into smaller files.`, 413, false);
  if (end === text.length) break;
  start = end - CHUNK_OVERLAP;
  if (/[\uDC00-\uDFFF]/.test(text[start]) && /[\uD800-\uDBFF]/.test(text[start - 1])) start--;
 }
 return chunks;
}
