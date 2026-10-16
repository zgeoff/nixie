import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A compaction the SDK's CLI ran, which a log keeps from releases before the guest turned it off:
// its trigger, its token counts with a null after count when the session reported none, and the
// newest recall it summarized. nixie writes none of these now.
export const modelCompactedCodec = defineRecordCodec(
  'model.compacted',
  z.object({
    trigger: z.enum(['manual', 'auto']),
    preTokens: z.int(),
    postTokens: z.int().nullable(),
    recalledThrough: z.int().nonnegative(),
  }),
);
