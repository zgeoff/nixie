import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const definitionConflictResolvedCodec = defineRecordCodec(
  'definition.conflict_resolved',
  z.object({
    changeID: z.string(),
    definitionID: z.string(),
    keep: z.enum(['nixie', 'repo']),

    // the repo's version at the choice
    definitions: z.string().nullable(),
  }),
);
