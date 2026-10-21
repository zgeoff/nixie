import { z } from 'zod';
import type { QuoteEvidence } from './types';

const quoteEvidence = z.strictObject({
  recordSequence: z.int(),
  start: z.int(),
  end: z.int(),
});

export function parseEvidence(column: string | null): QuoteEvidence | null {
  return column === null ? null : quoteEvidence.parse(JSON.parse(column));
}
