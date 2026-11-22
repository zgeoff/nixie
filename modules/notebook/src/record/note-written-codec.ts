import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const noteWrittenCodec = defineRecordCodec(
  'notebook.note_written',
  z.object({
    note: z.string(),
    shortID: z.string(),
    version: z.literal(1),
    writer: z.string(),
    model: z.string(),
    chars: z.int().nonnegative(),
    isPrivate: z.boolean(),
  }),
);
