import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const sandboxWokenCodec = defineRecordCodec(
  'sandbox.woken',
  z.object({ sandboxID: z.string() }),
);
