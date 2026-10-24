import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const promptsOverrideLapsedCodec = defineRecordCodec(
  'prompts.override_lapsed',
  z.object({ proposalID: z.string() }),
);
