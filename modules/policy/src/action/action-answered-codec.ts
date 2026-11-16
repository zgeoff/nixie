import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const actionAnsweredCodec = defineRecordCodec(
  'policy.action_answered',
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    answer: z.enum(['approved', 'declined']),
    identityID: z.string().exactOptional(),

    // which button answered; a record without it came before Always allow told itself apart
    choice: z.enum(['approve', 'always_allow', 'decline']).exactOptional(),

    // the gap group of a no_rule Approve or Decline, never of Always allow
    groupHash: z.string().exactOptional(),

    // the action that an approval queued or released
    actionID: z.string().exactOptional(),
  }),
);
