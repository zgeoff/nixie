import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The start of a forget of your message or a reply, with the sequence of the record it forgets.
export const recordForgetStartedCodec = defineRecordCodec(
  'record.forget_started',
  z.object({ recordSequence: z.int() }),
);
