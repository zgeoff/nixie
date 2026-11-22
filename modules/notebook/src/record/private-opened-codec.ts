import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const privateOpenedCodec = defineRecordCodec(
  'notebook.private_opened',
  z.object({ note: z.string() }),
);
