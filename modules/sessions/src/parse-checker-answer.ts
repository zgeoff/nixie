import { z } from 'zod';
import type { CheckerAnswer } from './checker-types';

const checkerOutput = z.object({
  verdict: z.enum(['asserted', 'not_asserted', 'unsure']),
  reason: z.string(),
});

// Reads the checker's structured output into an answer from the model. An answer that breaks the
// shape reads as unsure, so a garbled reply never lets a write through.
export function parseCheckerAnswer(output: unknown, model: string): CheckerAnswer {
  const parsed = checkerOutput.safeParse(output);

  if (!parsed.success) {
    return { verdict: 'unsure', reason: 'the answer was unreadable', model, failure: 'unreadable' };
  }

  return { verdict: parsed.data.verdict, reason: parsed.data.reason, model, failure: null };
}
