import { defineRecordCodec } from '@heynixie/log';
import { promptProposalSchema } from '../prompt/prompt-proposal-schema';

export const promptsOverrideProposedCodec = defineRecordCodec(
  'prompts.override_proposed',
  promptProposalSchema,
);
