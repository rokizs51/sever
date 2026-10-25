// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfText } from './pdf';

describe('extractPdfText', () => {
  it('extracts selectable text from a real PDF', async () => {
    const bytes = readFileSync(resolve(process.cwd(), 'docs/sample-cv-ats-structure.pdf'));
    const text = await extractPdfText(bytes);
    expect(text).toContain('Alexandra Chen');
    expect(text).toContain('WORK EXPERIENCE');
  });
});