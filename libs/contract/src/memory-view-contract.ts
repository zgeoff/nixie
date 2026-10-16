import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

// The memory view's procedures, which the contract serves under memory. Each read and each change
// waits for the memory store to start. A change is a checked action bound to the version the view
// showed, so an item that moved on since refuses it as stale and changes nothing.

const memoryView = signedIn.errors({
  MEMORY_NOT_STARTED: { message: 'The memory store has not started yet', status: 503 },
});

const memoryChange = memoryView.errors(reusedIDErrors).errors({
  MEMORY_ITEM_NOT_FOUND: { message: 'No memory item has this ID', status: 404 },
  STALE_VERSION: { message: 'The memory item has moved past that version', status: 409 },
  WRONG_STATE: { message: 'The memory item is not in a state that change takes', status: 409 },
});

const itemIDSchema = z.string().min(1).max(200);
const originSchema = z.enum(['owner', 'conversation', 'task', 'memory_writer']);
const sourceSchema = z.enum(['owner', 'owner_data', 'untrusted']);

// An item as the view lists it: its current version's text while its key exists, and when it was
// created, last changed and forgotten. A forgotten item carries no text and its forget's time.
const memoryItemSchema = z.object({
  changedAt: z.date(),
  createdAt: z.date(),
  forgottenAt: z.date().nullable(),
  isPinned: z.boolean(),
  itemID: z.string(),
  origin: originSchema,
  shortID: z.string(),
  source: sourceSchema,
  state: z.enum(['active', 'retired', 'forgetting', 'forgotten']),
  status: z.enum(['readable', 'shredded', 'unreadable']),
  text: z.string().optional(),
  version: z.int().positive(),
});

// A match carries its keyword score and its similarity, each where that index placed it.
const memoryMatchSchema = memoryItemSchema.extend({
  score: z.number().optional(),
  similarity: z.number().optional(),
});

// Where a version's quote sits in its message, and the message's text while the version's text and
// the message are both readable; null message while the version's text is gone.
const evidenceSchema = z.object({
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

// One version with its provenance: the task and proposal behind it, each write check's verdict,
// the models of the writer's call and of the checker, and its quote inside its message.
const memoryVersionSchema = z.object({
  change: z.enum(['created', 'edited', 'retired', 'restored', 'undone']),
  checkerModel: z.string().nullable(),
  checks: z.record(z.string(), z.unknown()).nullable(),
  evidence: evidenceSchema.nullable(),
  evidenceQuote: z.string().nullable(),
  origin: originSchema,
  proposalID: z.string().nullable(),
  recordedAt: z.date(),
  source: sourceSchema,
  state: z.enum(['active', 'retired']),
  status: z.enum(['readable', 'shredded', 'unreadable']),
  taskID: z.string().nullable(),
  text: z.string().optional(),
  version: z.int().positive(),
  writerModel: z.string().nullable(),
});

const versionTargetSchema = z.object({
  clientActionID: z.uuid(),
  itemID: itemIDSchema,
  version: z.int().positive(),
});

export const memoryViewContract = {
  // One page of the items in a state, in the order they were created. The forgotten page holds
  // each item a forget began, as a dated gap.
  listItems: memoryView
    .errors({ INVALID_CURSOR: { message: 'No page returned this cursor', status: 400 } })
    .input(
      z.object({
        after: z.string().max(20).optional(),
        limit: z.int().min(1).max(100).optional(),
        state: z.enum(['active', 'retired', 'forgotten']),
      }),
    )
    .output(z.object({ items: z.array(memoryItemSchema), next: z.string().nullable() })),

  // The active items whose text matches the query, best first, ranked as a recall ranks them. A
  // search writes no recall record, because it delivers nothing to a task.
  findItems: memoryView.input(z.object({ query: z.string().min(1).max(500) })).output(
    z.object({
      items: z.array(memoryMatchSchema),
      searchMode: z.enum(['hybrid', 'keyword', 'keyword-fallback']),
    }),
  ),

  // The pinned core in the order its items were pinned, and its size against its budget, in
  // tokens.
  readPinnedCore: memoryView.output(
    z.object({
      budget: z.int().nonnegative(),
      items: z.array(memoryItemSchema),
      tokens: z.int().nonnegative(),
    }),
  ),

  // One item with every version, oldest first.
  readItem: memoryView
    .errors({ MEMORY_ITEM_NOT_FOUND: { message: 'No memory item has this ID', status: 404 } })
    .input(z.object({ itemID: itemIDSchema }))
    .output(memoryItemSchema.extend({ versions: z.array(memoryVersionSchema) })),

  // Retires an active item, which leaves recall and the pinned core and keeps its history.
  retire: memoryChange
    .input(versionTargetSchema)
    .output(z.object({ itemID: z.string(), version: z.int().positive() })),

  // Makes a retired item active again with the text it had.
  restore: memoryChange
    .input(versionTargetSchema)
    .output(z.object({ itemID: z.string(), version: z.int().positive() })),

  // Puts an active item in the pinned core, or takes an item out of it. A pin adds no version.
  pin: memoryChange
    .errors({
      PINNED_CORE_FULL: { message: 'The pin takes the pinned core past its budget', status: 409 },
    })
    .input(versionTargetSchema.extend({ isPinned: z.boolean() }))
    .output(z.object({ isPinned: z.boolean(), itemID: z.string() })),
};
