import { defineRecordCodec } from '@heynixie/log';
import { skillProposalSchema } from './skill-proposal-schema';

// The record of a skill proposal that waits for your review.
export const skillsWriteProposedCodec = defineRecordCodec(
  'skills.write_proposed',
  skillProposalSchema,
);
