import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const ruleProposedCodec = defineRecordCodec(
  'rules.rule_proposed',
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    groupHash: z.string(),
    ruleHash: z.string(),
    actionHash: z.string(),
    riskClass: z.enum(['always_ask', 'lifting']),
    approvals: z.string().array(),

    // the proposal that an Edit withdrew, or null
    editOf: z.string().nullable(),
  }),
);
