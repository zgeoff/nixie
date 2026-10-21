import { z } from 'zod';

// Offsets count UTF-16 code units, as JavaScript string indices do.
export const spanSchema = z.object({
  end: z.int().nonnegative(),
  source: z.enum(['typed', 'pasted', 'dropped', 'unknown']),
  start: z.int().nonnegative(),
});
