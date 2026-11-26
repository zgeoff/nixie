import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A count of a route or a provider that a person corrected, such as a reset to zero from the
// spending page. It names the target, the period, and the dollars before and after, and it changes
// no limit.
export const spendCountSetCodec = defineRecordCodec(
  'spend.count_set',
  z.object({
    route: z.string().exactOptional(),
    provider: z.string().exactOptional(),
    period: z.enum(['day', 'month']),
    start: z.string(),
    from: z.number(),
    to: z.number(),
    by: z.string(),
  }),
);
