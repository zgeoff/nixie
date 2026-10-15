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

// an image of your message, with its bytes in base64 as the API keeps them sealed
const imageSchema = z.object({
  data: z.base64().default(() => faker.string.alphanumeric(8)),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).default('image/png'),
});

const messageSchema = z.object({
  clientMessageId: z.uuid().optional(),
  images: z.array(imageSchema).optional(),
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

const ratingItemSchema = z.object({
  hasNote: z.boolean().default(false),
  itemID: z.string(),
  verdict: z.enum(['helpful', 'noise', 'misleading']).default('helpful'),
  version: z.int().nonnegative().default(1),
});

const ratingSchema = z.object({
  items: z.array(ratingItemSchema),
  ratedBy: z.string().optional(),
  recalledSequence: z.int().nonnegative(),
});

const contextSchema = z.object({ size: z.int().nonnegative(), window: z.int().positive() });

const compactionSchema = z.object({
  postTokens: z.int().nonnegative().optional(),
  preTokens: z.int().nonnegative(),
  trigger: z.enum(['manual', 'auto']).default('auto'),
});

// a summary nixie committed, with its text while its key holds
const summarySchema = z.object({
  contextSize: z.int().nonnegative().optional(),
  summaryTokens: z.int().nonnegative(),
  text: z.string().optional(),
  trigger: z.enum(['threshold', 'overflow']).default('threshold'),
});

// the sequence a record.forgotten record forgets
const forgetSchema = z.object({ sequence: z.int() });

const records = new Collection({
  schema: z.object({
    compaction: compactionSchema.optional(),
    context: contextSchema.optional(),

    forget: forgetSchema.optional(),
    kind: z.string().default('owner_message'),
    message: messageSchema.optional(),
    rating: ratingSchema.optional(),
    recall: recallSchema.optional(),
    recordedAt: z.date().default(() => new Date()),
    sequence: z.int().default(() => {
      counter.lastSequence += 1;

      return counter.lastSequence;
    }),
    summary: summarySchema.optional(),
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

// A rating's note as nixie's memory store holds it, by its rating record's sequence and its item.
// A forgotten item's note is shredded and keeps no text.
const ratingNotes = new Collection({
  schema: z.object({
    itemID: z.string().default(() => faker.string.uuid()),
    sequence: z.int().nonnegative(),
    status: z.enum(['readable', 'shredded', 'unreadable']).default('readable'),
    text: z.string().optional(),
  }),
});

// Each forget a client action ID applied, with the record it named and its answer, as nixie's API
// keeps the first result of each checked action.
const forgetActions = new Collection({
  schema: z.object({
    clientActionID: z.uuid(),
    forgottenAt: z.date(),
    sequence: z.int(),
    thread: z.string(),
  }),
});

// The mock API's state: what nixie's API would hold in its database.
export const store = {
  enrolmentCodes,
  forgetActions,
  memoryVersions,
  ratingNotes,
  records,

  // Clears records before the sessions and codes they reference; the order is deliberate.
  reset: (): void => {
    records.clear();
    forgetActions.clear();
    memoryVersions.clear();
    ratingNotes.clear();
    enrolmentCodes.clear();
    sessions.clear();

    counter.lastSequence = 0;
  },
  sessions,
};
