import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

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
    clientActionID: z.uuid().nullable().default(null),
    code: z.string().default(() => faker.string.alphanumeric(8)),
    expiresAt: z.date().default(() => faker.date.soon()),
    sessionID: z.uuid().nullable().default(null),
  }),
});

const spanSchema = z.object({
  end: z.int().default(() => faker.number.int({ max: 200, min: 101 })),
  source: z.enum(['typed', 'pasted', 'dropped', 'unknown']).default('typed'),
  start: z.int().default(() => faker.number.int({ max: 100, min: 0 })),
});

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

const summarySchema = z.object({
  contextSize: z.int().nonnegative().optional(),
  summaryTokens: z.int().nonnegative(),
  text: z.string().optional(),
  trigger: z.enum(['threshold', 'overflow']).default('threshold'),
});

const forgetSchema = z.object({ sequence: z.int() });

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

const memoryVersions = new Collection({
  schema: z.object({
    itemID: z.string().default(() => faker.string.uuid()),
    status: z.enum(['readable', 'shredded', 'unreadable']).default('readable'),
    text: z.string().optional(),
    version: z.int().nonnegative().default(1),
  }),
});

const ratingNotes = new Collection({
  schema: z.object({
    itemID: z.string().default(() => faker.string.uuid()),
    sequence: z.int().nonnegative(),
    status: z.enum(['readable', 'shredded', 'unreadable']).default('readable'),
    text: z.string().optional(),
  }),
});

const memoryItemVersionSchema = z.object({
  change: z.enum(['created', 'edited', 'retired', 'restored', 'undone']).default('created'),
  checkerModel: z.string().nullable().default(null),
  checks: z.record(z.string(), z.unknown()).nullable().default(null),
  evidence: z.object({ end: z.int(), sequence: z.int(), start: z.int() }).nullable().default(null),
  evidenceQuote: z.string().nullable().default(null),

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

const memoryItems = new Collection({
  schema: z.object({
    forgottenAt: z.date().nullable().default(null),
    isPinned: z.boolean().default(false),
    isSensitive: z.boolean().default(false),
    subject: z.enum(['owner', 'self', 'shared']).default('owner'),

    failsForgetCleanup: z.boolean().default(false),

    isShredded: z.boolean().optional(),

    pinnedSequence: z.int().nonnegative().default(0),
    itemID: z.uuid().default(() => faker.string.uuid()),
    shortID: z.string().default(() => faker.string.alphanumeric(6)),
    state: z.enum(['active', 'retired', 'forgetting', 'forgotten']).default('active'),
    until: z.date().nullable().default(null),
    versions: z.array(memoryItemVersionSchema).min(1),
  }),
});

const writerErrorSchema = z.object({
  at: z.date(),
  code: z.string(),
  message: z.string().nullable(),
});

const memoryWriter = new Collection({
  schema: z.object({
    backlog: z.int().nonnegative().default(0),
    batches: z.int().nonnegative().default(0),
    cursor: z.int().nonnegative().default(0),
    failures: z.int().nonnegative().default(0),
    isCatchingUp: z.boolean().default(false),
    isEnabled: z.boolean().default(true),
    lastError: writerErrorSchema.nullable().default(null),
    retryAt: z.date().nullable().default(null),
  }),
});

const memoryConsolidator = new Collection({
  schema: z.object({
    isEnabled: z.boolean().default(true),
  }),
});

const noticeEntrySchema = z.object({
  change: z
    .enum(['created', 'edited', 'retired', 'restored', 'undone', 'proposed'])
    .default('created'),
  itemID: z.string(),
  proposalID: z.string().nullable().default(null),
  sequence: z.int().nonnegative().default(0),
  version: z.int().positive().nullable().default(1),
});

const memoryNotices = new Collection({
  schema: z.object({
    count: z.int().nonnegative().nullable().default(null),
    entries: z.array(noticeEntrySchema).default([]),
    kind: z.enum(['turn', 'batch', 'catch_up', 'run']).default('turn'),
    messageSequence: z.int().nonnegative().nullable().default(null),
    noticeKey: z.string().default(() => `batch/${faker.string.uuid()}`),
    sequence: z.int().nonnegative().nullable().default(null),
    thread: z.string().default('conversation'),
  }),
});

const memoryActions = new Collection({
  schema: z.object({
    clientActionID: z.uuid(),
    input: z.string(),
    result: z.string().optional(),
  }),
});

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

const proposalImageSchema = z.object({
  position: z.int().nonnegative(),
  sequence: z.int().positive(),
  thread: z.string(),
});

const memoryProposals = new Collection({
  schema: z.object({
    actionHash: z
      .string()
      .default(
        () => `sha256:${faker.string.hexadecimal({ casing: 'lower', length: 64, prefix: '' })}`,
      ),
    createdAt: z.date().default(() => faker.date.recent()),
    evidence: proposalEvidenceSchema.nullable().default(null),
    image: proposalImageSchema.nullable().default(null),
    isPinned: z.boolean().default(false),
    isSensitive: z.boolean().default(false),
    itemID: z.uuid().default(() => faker.string.uuid()),
    subject: z.enum(['owner', 'self', 'shared']).default('owner'),
    lapseAt: z.date().default(() => faker.date.soon({ days: 7 })),
    operation: z.enum(['remember', 'retire', 'pin']).default('remember'),
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
        'self_note',
        'from_photo',
        'sensitive',
      ])
      .default('no_quote'),
    source: z.enum(['owner', 'owner_data', 'untrusted']).default('untrusted'),
    status: z.enum(['pending', 'consumed', 'rejected', 'lapsed']).default('pending'),

    targetVersion: z.int().positive().nullable().default(null),
    text: z.string().default(() => faker.lorem.sentence()),
    until: z.date().nullable().default(null),
    thread: z.string().default('conversation'),
  }),
});

const momentReflectionSchema = z.object({
  model: z.string().default('claude-test-4'),
  reflectionID: z.string().default(() => faker.string.alphanumeric(10)),
  text: z.string().default(() => faker.lorem.sentence()),
  writtenAt: z.date().default(() => faker.date.recent()),
});

const momentNoteSchema = z.object({ text: z.string(), writtenAt: z.date() });
const itemIDsSchema = z.array(z.string());

const moments = new Collection({
  schema: z.object({
    editedAt: z.date().nullable().default(null),
    firstSequence: z.int().nonnegative().default(1),
    keptAt: z.date().default(() => faker.date.recent()),
    keptBy: z.enum(['owner', 'model']).default('model'),
    lastSequence: z.int().nonnegative().default(1),
    linkedItemIDs: itemIDsSchema.default([]),
    momentID: z.uuid().default(() => faker.string.uuid()),
    note: momentNoteSchema.nullable().default(null),
    reflections: z.array(momentReflectionSchema).default([]),
    shortID: z.string().default(() => faker.string.alphanumeric(10)),
    state: z.enum(['active', 'retired', 'destroyed']).default('active'),
    thread: z.string().default('conversation'),
    title: z.string().default(() => faker.lorem.words(3)),
    titleBy: z.enum(['owner', 'model']).default('model'),
    version: z.int().positive().default(1),
  }),
});

const forgetActions = new Collection({
  schema: z.object({
    clientActionID: z.uuid(),
    forgottenAt: z.date(),
    sequence: z.int(),
    thread: z.string(),
  }),
});

export const store = {
  enrolmentCodes,
  forgetActions,
  memoryActions,
  memoryConsolidator,
  memoryItems,
  memoryNotices,
  memoryProposals,
  memoryVersions,
  memoryWriter,
  moments,
  ratingNotes,
  records,

  // Clears records before the sessions and codes they reference; the order is deliberate.
  reset: (): void => {
    for (const collection of [
      records,
      forgetActions,
      memoryActions,
      memoryItems,
      memoryNotices,
      memoryProposals,
      memoryWriter,
      memoryConsolidator,
      memoryVersions,
      moments,
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
