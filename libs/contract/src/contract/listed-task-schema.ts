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

export const listedStateSchema = z.enum([...taskStateSchema.options, 'idle', 'finished', 'asleep']);

export const runFireSchema = z.object({
  scheduledFor: z.string(),
  firedAt: z.string(),
  isCatchUp: z.boolean(),
});

const taskControlSchema = z.enum(['pause', 'resume', 'stop', 'restart', 'close', 'interrupt']);

export const actionCountSchema = z.int().nonnegative();

// The session that a supervised task works with, which runs in another program. Its state is the
// session's own, as the task last saw it, and `lastEventAt` is null before the first event.
// `isReleased` is true once the task let go of the session, so a later close does nothing to it.
export const listedSessionSchema = z.object({
  isReleased: z.boolean(),
  lastEventAt: z.date().nullable(),
  origin: z.enum(['started', 'joined']),
  state: z.enum(['running', 'waiting', 'idle', 'ended', 'gone']),
});

export const listedTaskSchema = z.object({
  actions: z.object({
    cancelled: actionCountSchema,
    queued: actionCountSchema,
    started: actionCountSchema,
  }),
  brief: z.string(),
  closedBy: z.enum(['owner', 'nixie', 'disposable']).optional(),
  controls: z.array(taskControlSchema),
  definitionID: z.string().optional(),
  disposable: z.boolean().nullable(),
  fire: runFireSchema.nullable().optional(),
  isPauseRequested: z.boolean(),
  isPausedByNixie: z.boolean(),
  isTakingMessages: z.boolean(),
  lastActivityAt: z.date(),
  listedState: listedStateSchema.optional(),
  name: z.string(),
  nextRunAt: z.string().optional(),
  runner: z.string(),
  session: listedSessionSchema.optional(),
  state: taskStateSchema,
  taskID: threadSchema,
  wakeable: z.boolean().optional(),
  waitingOn: threadSchema.optional(),
});
