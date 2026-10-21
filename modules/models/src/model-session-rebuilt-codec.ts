import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const modelSessionRebuiltCodec = defineRecordCodec(
  'model.session_rebuilt',
  z.object({ reason: z.string(), recalledThrough: z.int().nonnegative() }),
);
