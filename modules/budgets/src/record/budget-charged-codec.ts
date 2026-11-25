import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// One amount on one budget for one period. It sits on no thread, so no task reads it.
const forSchema = z.object({ kind: z.enum(['tool_call', 'action']), id: z.string() });

const payloadSchema = z.object({
  chargeID: z.string(),
  budgetID: z.string(),
  periodStart: z.string(),

  // the spend ledger row the charge added to; a charge from before the ledger names none
  ledgerKey: z.string().exactOptional(),
  amountMicros: z.number().int().positive(),
  for: forSchema,
});

export const budgetChargedCodec = defineRecordCodec('budget.charged', payloadSchema);
