import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { wakeEventSchema } from './wake-event-schema';

// Written by coding.watch.
export const codingWakeSetCodec = defineRecordCodec(
  'coding.wake_set',
  z.object({ taskID: z.string(), wake: z.array(wakeEventSchema) }),
);
