import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The totals that a day's limits reach after a raise, never the size of the raise. A raise of a
// route's dollars names the route; a raise of the turns holds turns. A record from before the routes
// names no route, and only its turns still count.
export const spendLimitRaisedCodec = defineRecordCodec(
  'spend.limit_raised',
  z.object({
    start: z.string(),
    route: z.string().exactOptional(),
    dollars: z.number().exactOptional(),
    tokens: z.number().exactOptional(),
    turns: z.number().exactOptional(),
    by: z.string(),
  }),
);
