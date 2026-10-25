import { extractText, getDocumentProxy } from 'unpdf';

// A CV is short. The cap bounds parse cost on a hostile/odd file; longer
// documents get a clear error and the user can paste the relevant text.
export const MAX_PDF_PAGES = 12;

/**
 * Text-only PDF extraction. Scanned/image-only PDFs yield little or no text;
 * the route turns that into a "paste the text instead" message. The file is
 * never stored.
 */
export async function extractPdfText(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  // Copy into a plain Uint8Array: Node's Buffer is a Uint8Array subclass but
  // pdf.js rejects it explicitly.
  const data = new Uint8Array(bytes);
  const pdf = await getDocumentProxy(data);
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(`PDF has ${pdf.numPages} pages (max ${MAX_PDF_PAGES})`);
  }
  const { text } = await extractText(pdf, { mergePages: false });
  return text.join('\n\n');
}