import { faker } from '@faker-js/faker';
import { listedSessionSchema, listedStateSchema, taskStateSchema } from '@heynixie/contract';
import { taskControls } from '@heynixie/task-control';
import { Collection } from '@msw/data';
import { z } from 'zod';

const taskControlSchema = z.enum(['pause', 'resume', 'stop', 'restart', 'close', 'interrupt']);

const taskRunFireSchema = z.object({
  firedAt: z.string(),
  isCatchUp: z.boolean(),
  scheduledFor: z.string(),
});

export const taskRows = new Collection({
  schema: z.object({
    brief: z.string().default(() => faker.lorem.sentence()),
    closedBy: z.enum(['owner', 'nixie', 'disposable']).optional(),
    controls: z.array(taskControlSchema).default(() => [...taskControls]),
    definitionID: z.string().optional(),
    disposable: z.boolean().nullable().default(null),
    fire: taskRunFireSchema.nullable().optional(),
    isPauseRequested: z.boolean().default(false),
    isTakingMessages: z.boolean().default(true),
    lastActivityAt: z.date().default(() => new Date()),
    listedState: listedStateSchema.optional(),
    name: z.string().default(() => faker.lorem.words(2)),
    nextRunAt: z.string().optional(),
    resumeState: z.enum(['ready', 'waiting']).nullable().default(null),
    runner: z.string().default('sandbox'),
    session: listedSessionSchema.optional(),
    state: taskStateSchema.default('waiting'),
    taskID: z.string().default(() => faker.string.alphanumeric({ length: 10, casing: 'lower' })),
    wakeable: z.boolean().optional(),
    waitingOn: z.string().optional(),
  }),
});
