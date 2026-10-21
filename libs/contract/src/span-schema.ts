import { z } from 'zod';

// Offsets count UTF-16 code units, as JavaScript string indices do. The server labels the whole
// message unknown when its spans are out of order, overlap or leave a gap.
export const spanSchema = z.object({
  end: z.int().nonnegative(),
  source: z.enum(['typed', 'pasted', 'dropped', 'unknown']),
  start: z.int().nonnegative(),
});
