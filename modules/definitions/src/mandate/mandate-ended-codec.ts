import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const mandateEndedCodec = defineRecordCodec(
  'rules.mandate_ended',
  z.object({
    mandateID: z.string(),

    // End now, or the timer
    reason: z.enum(['ended', 'expired']),

    // the runtime changes it retired
    changeIDs: z.string().array(),
  }),
);
