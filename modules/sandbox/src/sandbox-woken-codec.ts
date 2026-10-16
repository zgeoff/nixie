import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A sleeping sandbox woken, named by its ID.
export const sandboxWokenCodec = defineRecordCodec(
  'sandbox.woken',
  z.object({ sandboxID: z.string() }),
);
