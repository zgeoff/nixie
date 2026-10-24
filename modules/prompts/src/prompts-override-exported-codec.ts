import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const promptsOverrideExportedCodec = defineRecordCodec(
  'prompts.override_exported',
  z.object({ proposalID: z.string(), approvalID: z.string(), pullRequestURL: z.string() }),
);
