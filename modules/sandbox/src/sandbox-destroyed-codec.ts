import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A sandbox gone, whether destroyed or never made because its create failed.
export const sandboxDestroyedCodec = defineRecordCodec(
  'sandbox.destroyed',
  z.object({ sandboxID: z.string(), reason: z.enum(['destroyed', 'create_failed']) }),
);
