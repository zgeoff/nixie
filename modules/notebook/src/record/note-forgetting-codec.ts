import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { forgetBySchema } from './forget-by-schema';

export const noteForgettingCodec = defineRecordCodec(
  'notebook.note_forgetting',
  z.object({ note: z.string(), version: z.int().positive(), by: forgetBySchema }),
);
