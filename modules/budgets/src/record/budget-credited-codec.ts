import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Gives one charge back to its budget. It sits on no thread.
export const budgetCreditedCodec = defineRecordCodec(
  'budget.credited',
  z.object({ chargeID: z.string() }),
);
