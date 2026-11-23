import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { forgetBySchema } from './forget-by-schema';

export const noteForgottenCodec = defineRecordCodec(
  'notebook.note_forgotten',
  z.object({ note: z.string(), shortID: z.string(), by: forgetBySchema }),
);
