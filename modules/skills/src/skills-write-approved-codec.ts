import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The record of your approval of a skill proposal, with the pull request on your definitions that
// carries the skill. The skill runs once that pull request merges and a seed brings it in.
export const skillsWriteApprovedCodec = defineRecordCodec(
  'skills.write_approved',
  z.object({ proposalID: z.string(), pullRequestURL: z.string() }),
);
