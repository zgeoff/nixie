import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const noteForgottenCodec = defineRecordCodec(
  'notebook.note_forgotten',
  z.object({ note: z.string(), shortID: z.string() }),
);
