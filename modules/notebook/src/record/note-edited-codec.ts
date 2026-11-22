import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const noteEditedCodec = defineRecordCodec(
  'notebook.note_edited',
  z.object({
    note: z.string(),
    version: z.int().min(2),
    chars: z.int().nonnegative(),
    writer: z.string(),
    model: z.string(),
    isPrivate: z.boolean(),
  }),
);
