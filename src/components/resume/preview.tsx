'use client';

import { PDFViewer } from '@react-pdf/renderer';
import { ResumeDocument } from '@/lib/resume/render/document';
import type { ResumeDoc } from '@/lib/domain/types';

/**
 * The on-screen preview IS the exported PDF: the same <ResumeDocument>
 * component the /pdf route renders server-side — what you see is literally
 * what you submit. Framed as a rounded sheet on its own card.
 */
export default function Preview({ doc, pageLimit }: { doc: ResumeDoc; pageLimit: 1 | 2 }) {
  return (
    <div className="overflow-hidden  border border-line bg-surface p-2">
      <div className="h-[70vh] overflow-hidden  bg-surface-2">
        <PDFViewer
          showToolbar={false}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          // @ts-expect-error the runtime does set the iframe title (react-pdf.browser.js:446); its prop types lag
          title="CV preview"
        >
          <ResumeDocument doc={doc} pageLimit={pageLimit} />
        </PDFViewer>
      </div>
    </div>
  );
}
