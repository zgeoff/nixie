import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const definitionRepoMovedCodec = defineRecordCodec(
  'definition.repo_moved',
  z.object({
    changeID: z.string(),
    definitionID: z.string(),
    definitions: z.string().nullable(),
  }),
);
