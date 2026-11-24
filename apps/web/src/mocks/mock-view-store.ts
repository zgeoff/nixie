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
    taskID: z.string().nullable().default(null),
    tools: toolsSchema.default([]),
    trigger: triggerSchema.nullable().default(null),
  }),
});

const recentFiresSchema = z.array(z.string()).default([]);

const reminders = new Collection({
  schema: z.object({
    name: z.string(),
    next: z.string().nullable().default(null),
    note: z.string(),
    recentFires: recentFiresSchema,
    reminder: z.string(),
    rendered: z.string(),
    sequence: z.int().default(nextSequence),
    state: z.enum(['active', 'fired', 'cancelled']).default('active'),
    trigger: triggerSchema,
  }),
});

// A stored image that the images page reads. A forgotten one answers as a forget does: it keeps its
// row and its edit source, and loses its name, its prompt and its picture.
const images = new Collection({
  schema: z.object({
    createdAt: z.date().default(() => faker.date.recent()),
    data: z
      .base64()
      .default(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      ),
    from: z.string().nullable().default(null),
    image: z.string().default(buildShortID),
    isForgotten: z.boolean().default(false),
    isPinned: z.boolean().default(false),
    name: z.string().nullable().default(null),
    prompt: z.string().nullable().default(null),

    // the order the rows were made in, which the page's cursor follows
    rowID: z.int().default(nextSequence),
    source: z.enum(['draw', 'file', 'photo']).default('draw'),
  }),
});

const imageForgets = new Collection({
  schema: z.object({
    clientActionID: z.uuid(),
    forgottenAt: z.date(),
    image: z.string(),
  }),
});

const noteVersionSchema = z.object({
  at: z.date(),
  body: z.string(),
  model: z.string().default('claude-model'),
  tags: z.array(z.string()).default([]),
  title: z.string(),
  writer: z.string().default('conversation'),
});

const noteLinkSchema = z.object({
  kind: z.enum(['note', 'memory', 'moment', 'event']),
  reason: z.string().nullable().default(null),
  target: z.string(),
  type: z.enum(['supersedes', 'disputes', 'part-of', 'cites', 'related']),
});

// A note of the notebook, with every version it was written in, oldest first. A forgotten note
// keeps its row and loses every version.
const notes = new Collection({
  schema: z.object({
    isForgotten: z.boolean().default(false),
    isPrivate: z.boolean().default(false),
    links: z.array(noteLinkSchema).default([]),
    note: z.string().default(buildShortID),
    ownerOpenedAt: z.date().nullable().default(null),
    readAt: z.date().nullable().default(null),

    // the order the rows were made in, which the page's cursor follows
    rowID: z.int().default(nextSequence),
    versions: z.array(noteVersionSchema).default([]),
  }),
});

const noteOpens = new Collection({
  schema: z.object({
    clientActionID: z.uuid(),
    note: z.string(),
    openedAt: z.date(),
    version: z.int().positive(),
  }),
});

const noteForgets = new Collection({
  schema: z.object({
    clientActionID: z.uuid(),
    forgottenAt: z.date(),
    note: z.string(),
    version: z.int().positive(),
  }),
});

// Every notebook.openPrivate call, with the action ID it carried, whether or not it finished; and
const stuckForgets = new Collection({
  schema: z.object({
    kind: z.string().default('note'),
    openForMs: z.int().nonnegative().default(400_000),
    shortID: z
      .string()
      .nullable()
      .default(() => faker.string.alphanumeric(6)),

    // true for a forget that a retry cannot finish
    staysStuck: z.boolean().default(false),
  }),
});

// the number of the next calls that fail before they write anything.
const noteOpenCalls: { clientActionIDs: string[]; failuresLeft: number } = {
  clientActionIDs: [],
  failuresLeft: 0,
};

export const mockViewStore = {
  definitions,
  endedRuns,
  imageForgets,
  images,
  noteForgets,
  noteOpenCalls,
  noteOpens,
  notes,
  reminders,
  reportEntries,
  stuckForgets,

  reset: (): void => {
    endedRuns.clear();
    reportEntries.clear();
    definitions.clear();
    reminders.clear();
    images.clear();
    imageForgets.clear();
    notes.clear();
    noteOpens.clear();
    noteForgets.clear();
    stuckForgets.clear();

    noteOpenCalls.clientActionIDs = [];
    noteOpenCalls.failuresLeft = 0;
  },
};

function buildShortID(): string {
  return faker.string.alphanumeric({ length: 10, casing: 'lower' });
}

function nextSequence(): number {
  mockSequence.lastSequence += 1;

  return mockSequence.lastSequence;
}
