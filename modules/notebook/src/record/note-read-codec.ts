import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const noteReadCodec = defineRecordCodec(
  'notebook.note_read',
  z.object({ note: z.string() }),
);
