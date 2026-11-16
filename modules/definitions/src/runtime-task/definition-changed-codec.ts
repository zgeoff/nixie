import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const definitionChangedCodec = defineRecordCodec(
  'definition.changed',
  z.object({
    changeID: z.string(),
    shortID: z.string(),
    definitionID: z.string(),
    operation: z.enum(['add', 'change', 'remove', 'undo']),

    // the version in force after the change; null after an undefine
    hash: z.string().nullable(),

    previous: z.string().nullable(),
    caller: z.enum(['conversation', 'owner']),

    // the change that an undo reverses
    undoes: z.string().nullable(),

    // the runtime change in force that this one superseded
    replaces: z.string().nullable(),
    base: z.string().nullable(),
    definitions: z.string().nullable(),
  }),
);
