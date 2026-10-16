import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { sandboxSpecSchema } from './sandbox-spec-schema';

// A sandbox an adapter made: its ID, the adapter that made it, and the spec it was made from.
export const sandboxCreatedCodec = defineRecordCodec(
  'sandbox.created',
  z.object({ sandboxID: z.string(), adapter: z.string(), spec: sandboxSpecSchema }),
);
