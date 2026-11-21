import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const imageUnpinnedCodec = defineRecordCodec(
  'image.unpinned',
  z.object({ image: z.string() }),
);
