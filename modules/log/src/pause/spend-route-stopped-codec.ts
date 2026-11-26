import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

// A route reached its day or month limit. The record is the notice to the owner: it names the route
// and the limit, and goes on no thread, so no model reads it.
export const spendRouteStoppedCodec = defineRecordCodec(
  'spend.route_stopped',
  z.object({
    route: z.string(),
    period: z.enum(['day', 'month']),
    limit: z.number(),
    spent: z.number(),
    at: z.number(),
    resetsAt: z.number(),
  }),
);
