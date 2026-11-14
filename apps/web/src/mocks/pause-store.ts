import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

const pauseCauseSchema = z.enum(['restore', 'owner', 'spending']);

const pauses = new Collection({
  schema: z.object({
    cause: pauseCauseSchema.default('owner'),
    since: z.date().default(() => new Date()),
  }),
});

const pauseExemptions = new Collection({
  schema: z.object({ taskID: z.string() }),
});

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
  stateAtBackup: taskStateSchema.default('waiting'),
  wasRunning: z.boolean().default(false),
  pendingActions: z.int().nonnegative().default(0),
});

const recoveries = new Collection({
  schema: z.object({
    backupTakenAt: z.date().default(() => faker.date.recent()),
    restoredAt: z.date().default(() => new Date()),
    toCheck: z.array(taskToCheckSchema).default([]),
  }),
});

const pausedSchema = z.object({ cause: pauseCauseSchema, since: z.date() }).nullable();

const nixieControlActions = new Collection({
  schema: z.object({
    clientActionID: z.uuid(),
    control: z.enum(['pause', 'resume']),
    paused: pausedSchema,
  }),
});

export const pauseStore = {
  nixieControlActions,
  pauseExemptions,
  pauses,
  recoveries,
  reset: (): void => {
    for (const collection of [nixieControlActions, pauseExemptions, pauses, recoveries]) {
      collection.clear();
    }
  },
};
