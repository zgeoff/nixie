import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const actionAnsweredCodec = defineRecordCodec(
  'policy.action_answered',
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    answer: z.enum(['approved', 'declined']),
  }),
);
