import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const sandboxGrantedCodec = defineRecordCodec(
  'sandbox.granted',
  z.object({ sandboxID: z.string(), secret: z.string(), host: z.string() }),
);
