import { PDFParse } from 'pdf-parse';
import { AppError } from '../errors';

export async function extractDocumentText(file: File): Promise<string> {
 const data = new Uint8Array(await file.arrayBuffer());
 let text: string;
 if (/\.pdf$/i.test(file.name)) {
  if (Buffer.from(data.subarray(0, 5)).toString('ascii') !== '%PDF-') throw new AppError('INVALID_FILE', 'Choose a valid PDF file.', 400, false);
  const parser = new PDFParse({ data, isEvalSupported: false });
  try { text = (await parser.getText({ pageJoiner: '' })).text; }
  catch { throw new AppError('INVALID_FILE', 'This PDF could not be read. Choose an unencrypted PDF with selectable text.', 400, false); }
  finally { await parser.destroy(); }
 } else {
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); }
  catch { throw new AppError('INVALID_ENCODING', 'Save the document as UTF-8 text and try again.', 400, false); }
 }
 if (!text.trim() || text.includes('\0')) throw new AppError('EMPTY_DOCUMENT', 'Choose a document with selectable text. Scanned PDFs need OCR before uploading.', 400, false);
 return text;
}
