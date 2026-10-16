import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A sandbox put to sleep, named by its ID.
export const sandboxSleptCodec = defineRecordCodec(
  'sandbox.slept',
  z.object({ sandboxID: z.string() }),
);
