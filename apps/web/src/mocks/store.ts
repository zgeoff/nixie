import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

// The log's sequence counter, which a real log keeps per database. reset() starts it again.
const counter = { lastSequence: 0 };

const sessions = new Collection({
  schema: z.object({
    createdAt: z.date().default(() => faker.date.recent()),
    deviceName: z.string().default(() => faker.commerce.productName()),
    lastUsedAt: z.date().default(() => faker.date.recent()),
    revokedAt: z.date().nullable().default(null),
    sessionID: z.uuid().default(() => faker.string.uuid()),
    token: z.string().default(() => faker.string.alphanumeric(43)),
  }),
});

const enrolmentCodes = new Collection({
  schema: z.object({
    // The client action ID of the enrolment that used the code, which answers a retry.
    clientActionID: z.uuid().nullable().default(null),
    code: z.string().default(() => faker.string.alphanumeric(8)),
    expiresAt: z.date().default(() => faker.date.soon()),
    sessionID: z.uuid().nullable().default(null),
  }),
});

// a default span ends after it starts
const spanSchema = z.object({
  end: z.int().default(() => faker.number.int({ max: 200, min: 101 })),
  source: z.enum(['typed', 'pasted', 'dropped', 'unknown']).default('typed'),
  start: z.int().default(() => faker.number.int({ max: 100, min: 0 })),
});

const messageSchema = z.object({
  clientMessageId: z.uuid().optional(),
  spans: z.array(spanSchema).optional(),
  text: z.string().default(() => faker.lorem.sentence()),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());

const taskSchema = z.object({
  errorLimit: z.int().optional(),
  errors: z.int().optional(),
  retryAt: z.date().optional(),
  stepKey: z.string().optional(),
  taskID: z.string().default(() => faker.string.uuid()),
});

const toolCallSchema = z.object({
  callID: z.string().default(() => faker.string.uuid()),
  content: jsonObjectSchema.optional(),
  input: jsonObjectSchema.optional(),
  outcome: z.string().optional(),
  tool: z.string().optional(),
});

const recallItemSchema = z.object({
  itemID: z.string(),
  score: z.number().optional(),
  version: z.int().nonnegative(),
});

const recallSchema = z.object({ items: z.array(recallItemSchema) });

const records = new Collection({
  schema: z.object({
    kind: z.string().default('owner_message'),
    message: messageSchema.optional(),
    recall: recallSchema.optional(),
    recordedAt: z.date().default(() => new Date()),
    sequence: z.int().default(() => {
      counter.lastSequence += 1;

      return counter.lastSequence;
    }),
    task: taskSchema.optional(),
    thread: z.string().default('conversation'),
    toolCall: toolCallSchema.optional(),
  }),
});

// A memory version's text as nixie's memory store holds it. A forgotten item's version is
// shredded and keeps no text.
const memoryVersions = new Collection({
  schema: z.object({
    itemID: z.string().default(() => faker.string.uuid()),
    status: z.enum(['readable', 'shredded', 'unreadable']).default('readable'),
    text: z.string().optional(),
    version: z.int().nonnegative().default(1),
  }),
});

// The mock API's state: what nixie's API would hold in its database.
export const store = {
  enrolmentCodes,
  memoryVersions,
  records,

  // Clears records before the sessions and codes they reference; the order is deliberate.
  reset: (): void => {
    records.clear();
    memoryVersions.clear();
    enrolmentCodes.clear();
    sessions.clear();
    counter.lastSequence = 0;
  },
  sessions,
};
