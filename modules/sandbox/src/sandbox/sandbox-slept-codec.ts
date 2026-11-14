import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const sandboxSleptCodec = defineRecordCodec(
  'sandbox.slept',
  z.object({ sandboxID: z.string() }),
);
