import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

// A provider that stands stopped now stands stopped at another limit or period. It replaces the
// stop's row and sends no notice, and the holds of the provider stay.
const payloadSchema = z.object({
  provider: z.string(),
  routes: z.array(z.string()),
  period: z.enum(['day', 'month']),
  limit: z.number(),
  spent: z.number(),
  at: z.number(),
  resetsAt: z.number(),
});

export const spendProviderRestatedCodec = defineRecordCodec(
  'spend.provider_restated',
  payloadSchema,
);
