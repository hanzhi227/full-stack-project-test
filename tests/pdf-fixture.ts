// Minimal real PDF with a selectable-text page, or a blank page.
export function pdfFixture(text = 'Keep the receipt.'): Buffer {
 const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : '';
 const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
 ];
 let pdf = '%PDF-1.4\n';
 const offsets = objects.map((object, i) => {
  const offset = Buffer.byteLength(pdf);
  pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  return offset;
 });
 const xref = Buffer.byteLength(pdf);
 pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(pdf);
}
