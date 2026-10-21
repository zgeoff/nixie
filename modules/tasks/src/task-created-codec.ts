import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskStateSchema } from './task-state-schema';

export const taskCreatedCodec = defineRecordCodec(
  'task.created',
  z.object({ taskID: z.string(), isConversation: z.boolean(), state: taskStateSchema }),
);
