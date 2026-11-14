import { z } from 'zod';

const taskStateSchema = z.enum([
  'ready',
  'running',
  'waiting',
  'paused',
  'stopped',
  'done',
  'failed',
  'closed',
]);

const taskToCheckSchema = z.object({
  taskID: z.string(),
  name: z.string(),
  stateAtBackup: taskStateSchema,
  wasRunning: z.boolean(),
  pendingActions: z.int().nonnegative(),
});

export const recoverySchema = z
  .object({
    restoredAt: z.date(),
    backupTakenAt: z.date(),
    toCheck: z.array(taskToCheckSchema),
  })
  .nullable();
