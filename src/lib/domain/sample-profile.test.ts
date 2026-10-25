import { describe, it, expect } from 'vitest';
import { PAYLOAD_SCHEMAS } from './schemas';
import { SAMPLE_ENTRIES } from './sample-profile';

// Same guard role as seed.test.ts: the sample is one-click user data, so a
// payload drifting from its schema would make the dashboard button 400
// halfway through.
describe('SAMPLE_ENTRIES', () => {
  it('every payload passes its type schema', () => {
    for (const entry of SAMPLE_ENTRIES) {
      for (const [i, payload] of entry.payloads.entries()) {
        const parsed = PAYLOAD_SCHEMAS[entry.type].safeParse(payload);
        expect(parsed.success, `${entry.type}[${i}]`).toBe(true);
      }
    }
  });
});
