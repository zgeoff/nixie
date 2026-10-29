import { z } from 'zod';
import { memoryExportContract } from './memory-export-contract';
import { momentContract } from './moment-contract';
import { proposalOutcomeSchema } from './proposal-outcome-schema';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const memoryView = signedIn.errors({
  MEMORY_NOT_STARTED: { message: 'The memory store has not started yet', status: 503 },
});

const memoryChange = memoryView.errors(reusedIDErrors).errors({
  MEMORY_ITEM_NOT_FOUND: { message: 'No memory item has this ID', status: 404 },
  STALE_VERSION: { message: 'The memory item has moved past that version', status: 409 },
  WRONG_STATE: { message: 'The memory item is not in a state that change takes', status: 409 },
});

const itemIDSchema = z.string().min(1).max(200);
const itemTextSchema = z.string().max(2000).regex(/\S/u);
const proposalOriginSchema = z.enum(['owner', 'conversation', 'task', 'memory_writer']);
const originSchema = z.enum([...proposalOriginSchema.options, 'lapse']);
const sourceSchema = z.enum(['owner', 'owner_data', 'untrusted']);
const subjectSchema = z.enum(['owner', 'self', 'shared']);
const kindSchema = z.enum(['fact', 'self']);

const memoryItemSchema = z.object({
  changedAt: z.date(),
  createdAt: z.date(),
  forgottenAt: z.date().nullable(),
  isPinned: z.boolean(),
  isSensitive: z.boolean(),
  itemID: z.string(),
  kind: kindSchema,
  origin: originSchema,
  shortID: z.string(),
  source: sourceSchema,
  state: z.enum(['active', 'retired', 'forgetting', 'forgotten']),
  status: z.enum(['readable', 'shredded', 'unreadable']),
  subject: subjectSchema,
  text: z.string().optional(),
  until: z.date().nullable(),
  version: z.int().positive(),
});

const memoryMatchSchema = memoryItemSchema.extend({
  score: z.number().optional(),
  similarity: z.number().optional(),
});

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

const reviewReasonSchema = z.enum([
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

  'other',
  'self_note',
  'from_photo',
  'sensitive',
]);

const proposalSourceSchema = z.object({
  origin: proposalOriginSchema,
  proposedAt: z.date(),
  thread: z.string().nullable(),
});

const memoryProposalSchema = z.object({
  actionHash: z.string(),
  createdAt: z.date(),
  evidence: evidenceSchema.nullable(),

  image: z
    .object({
      position: z.int().nonnegative(),
      sequence: z.int().positive(),
      thread: z.string(),
    })
    .nullable(),
  isPinned: z.boolean(),
  isSensitive: z.boolean(),
  itemID: z.string(),
  kind: kindSchema,
  lapseAt: z.date(),
  operation: z.enum(['remember', 'retire', 'pin']),
  origin: proposalOriginSchema,
  proposalID: z.string(),
  quote: z.string().nullable(),
  reason: reviewReasonSchema,
  source: sourceSchema,
  sources: z.array(proposalSourceSchema),
  subject: subjectSchema,
  targetVersion: z.int().positive().nullable(),
  text: z.string(),
  until: z.date().nullable(),
});

const proposalAnswerSchema = z.object({
  actionHash: z.string().min(1).max(200),
  clientActionID: z.uuid(),
  proposalID: z.string().min(1).max(200),
});

const revisionTargetSchema = z.object({ itemID: itemIDSchema, version: z.int().positive() });

const approvalAnswerSchema = proposalAnswerSchema.extend({
  editedText: itemTextSchema.optional(),
  ignoreCloseMatch: z.boolean().optional(),
  revisionOf: revisionTargetSchema.optional(),
});

const rejectionReasonSchema = z.string().max(500).regex(/\S/u);

const rejectionAnswerSchema = proposalAnswerSchema.extend({
  reason: rejectionReasonSchema.optional(),
});

const proposalOutcomesSchema = z.object({ outcomes: z.array(proposalOutcomeSchema) });
const memoryItemDetailSchema = memoryItemSchema.extend({ versions: z.array(memoryVersionSchema) });

const forgetLossSchema = z.object({
  evidenceMessages: z.int().nonnegative(),
  proposals: z.int().nonnegative(),
});

const forgetPreviewSchema = memoryItemDetailSchema.extend({ lost: forgetLossSchema });

const retiredForgetPreviewSchema = z.object({
  hasMore: z.boolean(),
  items: z.array(memoryItemSchema.extend({ lost: forgetLossSchema })),
});

const retiredForgetSchema = z.object({
  clientActionID: z.uuid(),
  targets: z
    .array(revisionTargetSchema)
    .min(1)
    .max(100)
    .refine((targets) => new Set(targets.map((target) => target.itemID)).size === targets.length, {
      message: 'Each item appears once',
    }),
});

const forgetStatusSchema = z.object({
  deleted: z.array(z.string()),
  pending: z.array(z.string()),
});

const versionTargetSchema = z.object({
  clientActionID: z.uuid(),
  itemID: itemIDSchema,
  version: z.int().positive(),
});

const versionResultSchema = z.object({ itemID: z.string(), version: z.int().positive() });

const noticeEntrySchema = z.object({
  change: z.enum(['created', 'edited', 'retired', 'restored', 'undone', 'proposed']),
  isKept: z.boolean(),
  item: memoryItemSchema
    .extend({ change: z.enum(['created', 'edited', 'retired', 'restored', 'undone']) })
    .nullable(),
  itemID: z.string(),
  proposalID: z.string().nullable(),
  sequence: z.int().nonnegative(),
  version: z.int().positive().nullable(),
});

const memoryNoticeSchema = z.object({
  entries: z.array(noticeEntrySchema),
  kind: z.enum(['turn', 'batch', 'catch_up', 'run']),
  messageSequence: z.int().nonnegative().nullable(),
  noticeKey: z.string(),
  proposed: z.int().nonnegative(),
  remembered: z.int().nonnegative(),
  retired: z.int().nonnegative(),
  sequence: z.int().nonnegative(),
});

export const memoryViewContract = {
  listItems: memoryView
    .errors({ INVALID_CURSOR: { message: 'No page returned this cursor', status: 400 } })
    .input(
      z.object({
        after: z.string().max(20).optional(),
        kind: kindSchema.optional(),
        limit: z.int().min(1).max(100).optional(),
        state: z.enum(['active', 'retired', 'forgotten']),
      }),
    )
    .output(z.object({ items: z.array(memoryItemSchema), next: z.string().nullable() })),

  findItems: memoryView.input(z.object({ query: z.string().min(1).max(500) })).output(
    z.object({
      items: z.array(memoryMatchSchema),
      searchMode: z.enum(['hybrid', 'keyword', 'keyword-fallback']),
    }),
  ),

  readPinnedCore: memoryView.output(
    z.object({
      budget: z.int().nonnegative(),
      items: z.array(memoryItemSchema),
      tokens: z.int().nonnegative(),
    }),
  ),

  readItem: memoryView
    .errors({ MEMORY_ITEM_NOT_FOUND: { message: 'No memory item has this ID', status: 404 } })
    .input(z.object({ itemID: itemIDSchema }))
    .output(memoryItemDetailSchema),

  retire: memoryChange.input(versionTargetSchema).output(versionResultSchema),

  restore: memoryChange.input(versionTargetSchema).output(versionResultSchema),

  listNotices: memoryView
    .input(z.object({ thread: z.string().min(1).max(200) }))
    .output(z.object({ notices: z.array(memoryNoticeSchema) })),

  undo: memoryChange
    .errors({
      PINNED_CORE_FULL: { message: 'The undo takes the pinned core past its budget', status: 409 },
    })
    .input(versionTargetSchema)
    .output(versionResultSchema),

  keep: memoryChange.input(versionTargetSchema).output(versionResultSchema),

  previewForget: memoryView
    .errors({
      MEMORY_ITEM_NOT_FOUND: { message: 'No memory item has this ID', status: 404 },
      STALE_VERSION: { message: 'The memory item has moved past that version', status: 409 },
    })
    .input(z.object({ itemID: itemIDSchema, version: z.int().positive() }))
    .output(forgetPreviewSchema),

  forget: memoryChange.input(versionTargetSchema).output(z.object({ itemID: z.string() })),

  previewForgetRetired: memoryView.output(retiredForgetPreviewSchema),

  forgetRetired: memoryChange.input(retiredForgetSchema).output(forgetStatusSchema),

  readForgetStatus: memoryView
    .input(z.object({ itemIDs: z.array(itemIDSchema).min(1).max(100) }))
    .output(forgetStatusSchema),

  pin: memoryChange
    .errors({
      PINNED_CORE_FULL: { message: 'The pin takes the pinned core past its budget', status: 409 },
    })
    .input(versionTargetSchema.extend({ isPinned: z.boolean() }))
    .output(z.object({ isPinned: z.boolean(), itemID: z.string() })),

  markSensitive: memoryChange
    .input(z.object({ clientActionID: z.uuid(), isSensitive: z.boolean(), itemID: itemIDSchema }))
    .output(z.object({ isSensitive: z.boolean(), itemID: z.string() })),

  listProposals: memoryView.output(z.object({ proposals: z.array(memoryProposalSchema) })),

  approveProposals: memoryView
    .input(
      z.object({
        answers: z.array(approvalAnswerSchema).min(1).max(50),
      }),
    )
    .output(proposalOutcomesSchema),

  rejectProposals: memoryView
    .input(
      z.object({
        answers: z.array(rejectionAnswerSchema).min(1).max(50),
      }),
    )
    .output(proposalOutcomesSchema),

  ...memoryExportContract,

  ...momentContract,
};
