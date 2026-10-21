import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { sandboxSpecSchema } from './sandbox-spec-schema';

export const sandboxCreatedCodec = defineRecordCodec(
  'sandbox.created',
  z.object({ sandboxID: z.string(), adapter: z.string(), spec: sandboxSpecSchema }),
);
