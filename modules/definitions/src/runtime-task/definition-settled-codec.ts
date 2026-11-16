import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const definitionSettledCodec = defineRecordCodec(
  'definition.settled',
  z.object({
    changeID: z.string(),
    definitionID: z.string(),
    outcome: z.enum(['adopted', 'retired']),
    cause: z.enum(['seed', 'one_shot_fired', 'one_shot_skipped']),

    // the version in force after the settle
    hash: z.string().nullable(),
  }),
);
