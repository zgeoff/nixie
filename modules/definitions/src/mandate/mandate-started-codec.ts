import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const mandateStartedCodec = defineRecordCodec(
  'rules.mandate_started',
  z.object({
    mandateID: z.string(),
    proposalID: z.string(),
    changeIDs: z.string().array(),
    expires: z.number(),
    identityID: z.string().exactOptional(),
  }),
);
