import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The owner's change of a started task's mark. The mark itself starts on the creation record.
export const taskMarkSetCodec = defineRecordCodec(
  'task.mark_set',
  z.object({ taskID: z.string(), disposable: z.boolean() }),
);
