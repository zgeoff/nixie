import { z } from 'zod';

// Offsets count UTF-16 code units, as JavaScript string indices do. Only a voice call writes
// `dictated`: the text is a speech transcript.
export const spanSchema = z.object({
  end: z.int().nonnegative(),
  source: z.enum(['typed', 'pasted', 'dropped', 'dictated', 'unknown']),
  start: z.int().nonnegative(),
});

// The span of a message that a client sends, which can never be dictated.
export const sentSpanSchema = spanSchema.extend({
  source: z.enum(['typed', 'pasted', 'dropped', 'unknown']),
});
