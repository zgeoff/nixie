import { z } from 'zod';
import { threadSchema } from './thread-schema';

export const taskStateSchema = z.enum([
  'ready',
  'running',
  'waiting',
  'paused',
  'stopped',
  'done',
  'failed',
  'closed',
]);

const taskControlSchema = z.enum(['pause', 'resume', 'stop', 'restart', 'close', 'interrupt']);

export const actionCountSchema = z.int().nonnegative();

export const listedTaskSchema = z.object({
  actions: z.object({
    cancelled: actionCountSchema,
    queued: actionCountSchema,
    started: actionCountSchema,
  }),
  brief: z.string(),
  closedBy: z.enum(['owner', 'nixie', 'disposable']).optional(),
  controls: z.array(taskControlSchema),
  disposable: z.boolean().nullable(),
  isPauseRequested: z.boolean(),
  isPausedByNixie: z.boolean(),
  isTakingMessages: z.boolean(),
  lastActivityAt: z.date(),
  name: z.string(),
  nextRunAt: z.string().optional(),
  runner: z.string(),
  state: taskStateSchema,
  taskID: threadSchema,
  wakeable: z.boolean().optional(),
  waitingOn: threadSchema.optional(),
});
