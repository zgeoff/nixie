import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const mandateProposedCodec = defineRecordCodec(
  'rules.mandate_proposed',
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    mandateID: z.string(),
    ruleHashes: z.string().array(),
    actionHash: z.string(),
    riskClass: z.enum(['always_ask', 'lifting']),

    // milliseconds since the epoch
    expires: z.number(),
    proposedBy: z.enum(['owner', 'nixie']),
  }),
);
