import { defineRecordCodec } from '@heynixie/log';
import { skillProposalSchema } from '../utils/skill-proposal-schema';

export const skillsWriteProposedCodec = defineRecordCodec(
  'skills.write_proposed',
  skillProposalSchema,
);
