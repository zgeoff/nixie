import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The totals that a day's limits reach after a raise, never the size of the raise. `start` is the
// day's first date in the default zone, and `by` the session that confirmed or `host`.
export const spendLimitRaisedCodec = defineRecordCodec(
  'spend.limit_raised',
  z.object({
    start: z.string(),
    dollars: z.number(),
    tokens: z.number(),
    turns: z.number(),
    by: z.string(),
  }),
);
