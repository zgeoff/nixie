import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskStateSchema } from './task-state-schema';

// A new task, and the state it starts in.
export const taskCreatedCodec = defineRecordCodec(
  'task.created',
  z.object({ taskID: z.string(), isConversation: z.boolean(), state: taskStateSchema }),
);
