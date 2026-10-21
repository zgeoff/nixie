import { defineRecordCodec } from '@heynixie/log';
import { skillProposalSchema } from './skill-proposal-schema';

export const skillsWriteProposedCodec = defineRecordCodec(
  'skills.write_proposed',
  skillProposalSchema,
);
