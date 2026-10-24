import { defineRecordCodec } from '@heynixie/log';
import { promptProposalSchema } from './prompt-proposal-schema';

export const promptsOverrideProposedCodec = defineRecordCodec(
  'prompts.override_proposed',
  promptProposalSchema,
);
