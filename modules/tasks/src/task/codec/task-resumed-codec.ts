import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskResumedCodec = defineRecordCodec(
  'task.resumed',
  z.object({ taskID: z.string(), nextState: z.enum(['ready', 'running', 'waiting']) }),
);
