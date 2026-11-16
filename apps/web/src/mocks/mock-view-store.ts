import { faker } from '@faker-js/faker';
import { runFireSchema, triggerSchema } from '@heynixie/contract';
import { Collection } from '@msw/data';
import { z } from 'zod';
import { mockSequence } from './mock-sequence';

const usedSchema = z.object({ turns: z.number(), dollars: z.number() });

const skipReasonSchema = z.enum([
  'too_late',
  'catch_up_off',
  'window_closed',
  'still_running',
  'task_held',
]);

const endedRuns = new Collection({
  schema: z.object({
    carriesRunID: z.string().nullable().default(null),
    cause: z.string().default('finished'),
    definitionID: z.string().nullable().default(null),
    delivery: z.enum(['wake', 'next_turn', 'kept']).default('wake'),
    endedAt: z.date().default(() => new Date()),
    endedBy: z.string().default('task'),
    fire: runFireSchema.nullable().default(null),
    reportID: z.string().default(buildShortID),
    runID: z.string().default(() => faker.string.uuid()),
    sequence: z.int().default(nextSequence),
    startedAt: z.date().default(() => new Date()),
    taskID: z.string(),
    used: usedSchema.default({ turns: 1, dollars: 0 }),
  }),
});

const reportEntries = new Collection({
  schema: z.object({
    definitionID: z.string(),
    firedAt: z.string().nullable().default(null),
    kind: z.enum(['late', 'skipped']),
    lateBySeconds: z.number().nullable().default(null),
    name: z.string(),
    reason: skipReasonSchema.nullable().default(null),
    scheduledFor: z.string(),
    sequence: z.int().default(nextSequence),
  }),
});

const toolsSchema = z.array(z.string());

const createdBySchema = z.object({
  kind: z.enum(['definition.changed', 'definitions_seeded']),
  sequence: z.int(),
});

const definitions = new Collection({
  schema: z.object({
    createdBy: createdBySchema,
    definitionID: z.string(),
    enabled: z.boolean().default(true),
    isUnreadable: z.boolean().default(false),
    name: z.string(),
    next: z.string().nullable().default(null),
    origin: z.enum(['definitions', 'nixie']).default('nixie'),
    rendered: z.string().nullable().default(null),
    target: z.enum(['task', 'conversation']).default('task'),
    taskID: z.string().nullable().default(null),
    tools: toolsSchema.default([]),
    trigger: triggerSchema.nullable().default(null),
  }),
});

export const mockViewStore = {
  definitions,
  endedRuns,
  reportEntries,

  reset: (): void => {
    endedRuns.clear();
    reportEntries.clear();
    definitions.clear();
  },
};

function buildShortID(): string {
  return faker.string.alphanumeric({ length: 10, casing: 'lower' });
}

function nextSequence(): number {
  mockSequence.lastSequence += 1;

  return mockSequence.lastSequence;
}
