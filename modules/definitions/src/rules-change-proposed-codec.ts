import { defineRecordCodec } from '@heynixie/log';
import { ruleProposalSchema } from './rule-proposal-schema';

export const rulesChangeProposedCodec = defineRecordCodec(
  'rules.change_proposed',
  ruleProposalSchema,
);
