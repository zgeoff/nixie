import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The end of a forget of your message or a reply, once its key is gone.
export const recordForgottenCodec = defineRecordCodec(
  'record.forgotten',
  z.object({ recordSequence: z.int() }),
);
