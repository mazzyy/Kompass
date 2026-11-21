// Read text from a PDF in the browser (pdf.js, bundled locally; no network).
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function readPdfText(data: ArrayBuffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = '';
    for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof it.str !== 'string') continue;
      line += it.str;
      if (it.hasEOL) {
        out.push(line);
        line = '';
      }
    }
    if (line) out.push(line);
  }
  return out.join('\n');
}
