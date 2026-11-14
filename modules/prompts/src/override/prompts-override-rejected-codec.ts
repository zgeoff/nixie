import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const promptsOverrideRejectedCodec = defineRecordCodec(
  'prompts.override_rejected',
  z.object({ proposalID: z.string() }),
);
