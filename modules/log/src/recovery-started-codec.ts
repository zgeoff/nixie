import type { TaskState } from '@heynixie/task-control';
import { z } from 'zod';
import { defineRecordCodec } from './define-record-codec';

const taskStateSchema = z.enum([
  'ready',
  'running',
  'waiting',
  'paused',
  'stopped',
  'failed',
  'done',
  'closed',
]) satisfies z.ZodType<TaskState>;

const taskToCheckSchema = z.object({
  taskID: z.string(),
  stateAtBackup: taskStateSchema,
  wasRunning: z.boolean(),
  pendingActions: z.number(),
});

export const recoveryStartedCodec = defineRecordCodec(
  'recovery.started',
  z.object({
    recoveryID: z.string(),
    restoredAt: z.number(),
    backupTakenAt: z.number(),
    toCheck: z.array(taskToCheckSchema),
  }),
);
