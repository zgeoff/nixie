import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const ruleAnsweredCodec = defineRecordCodec(
  'rules.rule_answered',
  z.object({
    proposalID: z.string(),
    groupHash: z.string(),
    answer: z.enum(['approved', 'declined']),
    identityID: z.string().exactOptional(),

    // set by Not now, so a rebuild of the projection never reads the current settings
    quietUntil: z.number().exactOptional(),
  }),
);
