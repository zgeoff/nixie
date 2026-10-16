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

// your answer to a memory proposal, which an approval or a rejection record holds
const answerSchema = z.object({
  answer: z.enum(['approved', 'edited', 'rejected']),
  identityID: z.string(),
  proposalID: z.string(),
  reason: z.string().optional(),
});

const records = new Collection({
  schema: z.object({
    answer: answerSchema.optional(),
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

// One version of a memory item as nixie's memory store holds it, with its provenance and the quote
// it came from, which points into the message at its sequence.
const memoryItemVersionSchema = z.object({
  change: z.enum(['created', 'edited', 'retired', 'restored', 'undone']).default('created'),
  checkerModel: z.string().nullable().default(null),
  checks: z.record(z.string(), z.unknown()).nullable().default(null),
  evidence: z.object({ end: z.int(), sequence: z.int(), start: z.int() }).nullable().default(null),
  evidenceQuote: z.string().nullable().default(null),

  // a version whose key fails to unwrap, which nixie reads as unreadable
  isUnreadable: z.boolean().default(false),
  origin: z.enum(['owner', 'conversation', 'task', 'memory_writer']).default('owner'),
  proposalID: z.string().nullable().default(null),
  recordedAt: z.date().default(() => faker.date.recent()),
  source: z.enum(['owner', 'owner_data', 'untrusted']).default('owner'),
  state: z.enum(['active', 'retired']).default('active'),
  taskID: z.string().nullable().default(null),
  text: z.string().default(() => faker.lorem.sentence()),
  writerModel: z.string().nullable().default(null),
});

// A memory item with every version, oldest first, in the order nixie created them. A forgotten
// item keeps its versions and their dates, and reads every one as a gap.
const memoryItems = new Collection({
  schema: z.object({
    forgottenAt: z.date().nullable().default(null),
    isPinned: z.boolean().default(false),

    // whether the item's key is gone; unset, it follows the state, and false on a forgetting item
    // is a forget whose cleanup stalled before it removed the key
    isShredded: z.boolean().optional(),

    // the item's place in the pinned core, as the pin's sequence orders it; an item a test pins
    // where it creates it comes before every item the view pins
    pinnedSequence: z.int().nonnegative().default(0),
    itemID: z.uuid().default(() => faker.string.uuid()),
    shortID: z.string().default(() => faker.string.alphanumeric(6)),
    state: z.enum(['active', 'retired', 'forgetting', 'forgotten']).default('active'),
    versions: z.array(memoryItemVersionSchema).min(1),
  }),
});

const writerErrorSchema = z.object({
  at: z.date(),
  code: z.string(),
  message: z.string().nullable(),
});

// The memory writer's progress as nixie's memory module reports it. The store holds at most one,
// and without one the writer reads as caught up at the last record.
const memoryWriter = new Collection({
  schema: z.object({
    backlog: z.int().nonnegative().default(0),
    batches: z.int().nonnegative().default(0),
    cursor: z.int().nonnegative().default(0),
    failures: z.int().nonnegative().default(0),
    isCatchingUp: z.boolean().default(false),
    lastError: writerErrorSchema.nullable().default(null),
    retryAt: z.date().nullable().default(null),
  }),
});

// Each memory change or proposal answer a client action ID applied, with the input it bound to and
// the outcome that answers its retries, as nixie's API keeps the first result of each checked action.
const memoryActions = new Collection({
  schema: z.object({
    clientActionID: z.uuid(),
    input: z.string(),
    result: z.string().optional(),
  }),
});

// where a proposal's quote sits in the message it came from, with that message while it is readable
const proposalEvidenceSchema = z.object({
  end: z.int().nonnegative(),
  message: z
    .object({
      status: z.enum(['readable', 'shredded', 'unreadable', 'missing']),
      text: z.string().optional(),
    })
    .nullable(),
  sequence: z.int().nonnegative(),
  start: z.int().nonnegative(),
});

// A memory proposal as nixie's memory store holds it: the operation it binds to, the check that
// sent it to review, and its status once an answer or its lapse closed it.
const memoryProposals = new Collection({
  schema: z.object({
    actionHash: z
      .string()
      .default(
        () => `sha256:${faker.string.hexadecimal({ casing: 'lower', length: 64, prefix: '' })}`,
      ),
    createdAt: z.date().default(() => faker.date.recent()),
    evidence: proposalEvidenceSchema.nullable().default(null),
    isPinned: z.boolean().default(false),
    itemID: z.uuid().default(() => faker.string.uuid()),
    lapseAt: z.date().default(() => faker.date.soon({ days: 7 })),
    operation: z.enum(['remember', 'retire']).default('remember'),
    origin: z.enum(['owner', 'conversation', 'task', 'memory_writer']).default('memory_writer'),
    proposalID: z.uuid().default(() => faker.string.uuid()),
    quote: z.string().nullable().default(null),
    reason: z
      .enum([
        'no_quote',
        'quote_not_typed',
        'quote_in_quoted_block',
        'invisible_character',
        'token_missing',
        'checker_not_asserted',
        'checker_unsure',
        'checker_unreachable',
        'forgotten_evidence',
        'ambiguous_target',
        'pinned',
      ])
      .default('no_quote'),
    source: z.enum(['owner', 'owner_data', 'untrusted']).default('untrusted'),
    status: z.enum(['pending', 'consumed', 'rejected', 'lapsed']).default('pending'),

    // the version of the item a change binds to, or null for a new item
    targetVersion: z.int().positive().nullable().default(null),
    text: z.string().default(() => faker.lorem.sentence()),
    thread: z.string().default('conversation'),
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
  memoryActions,
  memoryItems,
  memoryProposals,
  memoryVersions,
  memoryWriter,
  ratingNotes,
  records,

  // Clears records before the sessions and codes they reference; the order is deliberate.
  reset: (): void => {
    for (const collection of [
      records,
      forgetActions,
      memoryActions,
      memoryItems,
      memoryProposals,
      memoryWriter,
      memoryVersions,
      ratingNotes,
      enrolmentCodes,
      sessions,
    ]) {
      collection.clear();
    }

    counter.lastSequence = 0;
  },
  sessions,
};
