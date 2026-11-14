import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const sandboxDestroyedCodec = defineRecordCodec(
  'sandbox.destroyed',
  z.object({ sandboxID: z.string(), reason: z.enum(['destroyed', 'create_failed']) }),
);
