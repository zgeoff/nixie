import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

// A trip by a limit holds the period, the measure and the numbers. A trip because the gateway is
// unreachable, or because it holds the lost mark, holds the time only. It sits on no thread.
export const spendStopTrippedCodec = defineRecordCodec(
  'spend.stop_tripped',
  z.object({
    reason: z.enum(['limit', 'unreachable', 'lost']),
    at: z.number(),
    period: z.enum(['day', 'month']).exactOptional(),
    measure: z.enum(['dollars', 'tokens', 'turns']).exactOptional(),
    limit: z.number().exactOptional(),
    spent: z.number().exactOptional(),
    resetsAt: z.number().exactOptional(),
  }),
);
