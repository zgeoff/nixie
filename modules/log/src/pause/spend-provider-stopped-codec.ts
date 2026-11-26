import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

// A provider reached its day or month limit, so every route of it stops. The record is the notice
// to the owner: it names the provider and the limit, lists the provider's routes so a step finds
// its provider's stop from the log alone, and goes on no thread, so no model reads it.
const payloadSchema = z.object({
  provider: z.string(),
  routes: z.array(z.string()),
  period: z.enum(['day', 'month']),
  limit: z.number(),
  spent: z.number(),
  at: z.number(),
  resetsAt: z.number(),
});

export const spendProviderStoppedCodec = defineRecordCodec('spend.provider_stopped', payloadSchema);
