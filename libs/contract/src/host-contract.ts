import { oc } from '@orpc/contract';
import { z } from 'zod';

// The host commands' contract, which the control socket serves to a shell in nixie's container.
// It is never part of the device contract, so it stays out of the OpenAPI document.

const versionRefSchema = z.object({ itemID: z.string(), version: z.int().positive() });

// the item and the version a change binds to, as memory-show printed them
const versionTargetSchema = z.strictObject({
  itemID: z.string().min(1),
  version: z.int().positive(),
});

// the text of an item you write, within the bound the model's memory tools take
const itemTextSchema = z.string().max(2000).regex(/\S/u);
const memoryOriginSchema = z.enum(['owner', 'conversation', 'task', 'memory_writer']);
const contentSourceSchema = z.enum(['owner', 'owner_data', 'untrusted']);

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
]);

// one write that proposed a change: the proposal's own, or one that merged into it
const proposalSourceSchema = z.object({
  origin: memoryOriginSchema,
  thread: z.string().nullable(),
  proposedAt: z.date(),
});

// What a host command shows of a pending proposal: its text, every source that proposed it, and
// the hash an answer binds to.
const pendingProposalSchema = z.object({
  proposalID: z.string(),
  operation: z.enum(['remember', 'retire']),
  itemID: z.string(),
  targetVersion: z.int().nullable(),
  isPinned: z.boolean(),
  reason: reviewReasonSchema,
  actionHash: z.string(),
  origin: memoryOriginSchema,
  source: contentSourceSchema,
  createdAt: z.date(),
  lapseAt: z.date(),
  sources: z.array(proposalSourceSchema),
  text: z.string(),
  quote: z.string().nullable(),
});

// An approval applied, or held for the active item that closely matches the proposal.
const closeMatchSchema = z.object({ itemID: z.string(), version: z.int(), text: z.string() });

const approvalResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('applied'), itemID: z.string(), version: z.int() }),
  z.object({ status: z.literal('close_match'), item: closeMatchSchema }),
]);

// one version of an item, with its text, or null with the status that says why the text is gone
const historyVersionSchema = z.object({
  version: z.int(),
  change: z.enum(['created', 'edited', 'retired', 'restored', 'undone']),
  state: z.enum(['active', 'retired']),
  origin: memoryOriginSchema,
  source: contentSourceSchema,
  recordedAt: z.date(),
  status: z.enum(['readable', 'shredded', 'unreadable']),
  text: z.string().nullable(),
});

// What a host command shows of an item: its state, and each version oldest first.
const itemHistorySchema = z.object({
  itemID: z.string(),
  state: z.enum(['active', 'retired', 'forgetting', 'forgotten']),
  versions: z.array(historyVersionSchema),
});

// one input of a change: the version the change read, its text then, and whether the item still
// stands at that version
const changeInputSchema = z.object({
  itemID: z.string(),
  version: z.int(),
  text: z.string().nullable(),
  isCurrent: z.boolean(),
});

const changeCommentSchema = z.object({ text: z.string(), at: z.date() });

const consolidationChangeSchema = z.object({
  changeID: z.string(),
  shortID: z.string(),
  kind: z.enum(['merge', 'rewrite', 'retire']),
  inputs: z.array(changeInputSchema),
  text: z.string().nullable(),
  reason: z.string(),
  source: contentSourceSchema,
  actionHash: z.string(),
  lapseAt: z.date(),
  comment: changeCommentSchema.nullable(),
});

// What a host command shows of the consolidator's diff: each change with its inputs, new text,
// reason, answer hash, comment and short ID, and the summary the consolidator left for you, which
// a run with no change shows on its own.
const consolidationDiffSchema = z.object({
  diffID: z.string(),
  model: z.string().nullable(),
  createdAt: z.date(),
  changes: z.array(consolidationChangeSchema),
  summary: z.string().nullable(),
});

const changeOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    changeID: z.string(),
    status: z.literal('applied'),
    versions: z.array(versionRefSchema),
  }),
  z.object({ changeID: z.string(), status: z.literal('refused'), code: z.string() }),
]);

const changeAnswerSchema = z.strictObject({
  changeID: z.string().min(1),
  actionHash: z.string().min(1),
});

// An answer to a proposal binds to the action hash memory-pending showed.
const proposalAnswerSchema = z.strictObject({
  proposalID: z.string().min(1),
  actionHash: z.string().min(1),
});

// A live device session as a host command lists it.
const hostSessionSchema = z.object({
  sessionID: z.string(),
  deviceName: z.string(),
  createdAt: z.date(),
  lastUsedAt: z.date(),
});

// Every memory procedure waits for the memory store to start, and keeps the code of each error
// the memory store refuses a request with.
const memory = oc.errors({
  MEMORY_NOT_STARTED: { message: 'the memory store has not started yet', status: 503 },
  NOT_FOUND: { message: 'nothing has that ID', status: 404 },
  PROPOSAL_HASH: { message: 'the action hash names another proposal', status: 409 },
  PROPOSAL_CLOSED: { message: 'the proposal is answered or lapsed', status: 409 },
  STALE_VERSION: { message: 'the item has moved past that version', status: 409 },
  WRONG_STATE: { message: 'the item is not in a state that change takes', status: 409 },
  PINNED_CORE_FULL: { message: 'the pinned core is full', status: 409 },
  REVISION_TARGET: { message: 'that item cannot take the revision', status: 400 },
  RETIREMENT_EDIT: { message: 'a retirement takes no edited text', status: 400 },
});

export const hostContract = {
  // Resets the log and keeps the live device sessions. The answer arrives once the reset
  // finished, and the server then stops.
  reset: oc.output(
    z.object({
      resetAt: z.date(),
      lastSequence: z.int().nonnegative(),
      keptSessions: z.int().nonnegative(),
    }),
  ),
  sessions: {
    // Issues a code that signs one device in.
    issueCode: oc.output(z.object({ code: z.string(), expiresAt: z.date() })),
    list: oc.output(z.array(hostSessionSchema)),

    // Sets the label of a device session that is still signed in.
    label: oc
      .errors({
        SESSION_NOT_FOUND: {
          message: 'no device session that is still signed in has that ID',
          status: 404,
        },
        LABEL_INVALID: { message: 'a label holds 1 to 100 characters besides spaces', status: 400 },
      })
      .input(z.strictObject({ sessionID: z.string().min(1), label: z.string() }))
      .output(z.object({ sessionID: z.string(), label: z.string() })),
  },
  memory: {
    proposals: {
      list: memory.output(z.array(pendingProposalSchema)),

      // An approval held for a close match is answered again, as a revision of that item or as a
      // new item. Edited text replaces the proposal's, and makes you the approved version's origin.
      approve: memory
        .input(
          proposalAnswerSchema.extend({
            revisionOf: versionTargetSchema.optional(),
            ignoreCloseMatch: z.boolean().optional(),
            editedText: itemTextSchema.optional(),
          }),
        )
        .output(approvalResultSchema),

      // A rejection's reason is what the conversation reads in its next turn.
      reject: memory
        .input(proposalAnswerSchema.extend({ reason: z.string().max(500).regex(/\S/u).optional() }))
        .output(z.object({ proposalID: z.string() })),
    },
    items: {
      read: memory.input(z.strictObject({ itemID: z.string().min(1) })).output(itemHistorySchema),

      // An edit replaces the item's whole text. Each change but a pin binds to the version the
      // caller read, so an item that moved on since refuses it as stale.
      edit: memory
        .input(versionTargetSchema.extend({ text: itemTextSchema }))
        .output(versionRefSchema),
      retire: memory.input(versionTargetSchema).output(versionRefSchema),
      restore: memory.input(versionTargetSchema).output(versionRefSchema),
      pin: memory
        .input(z.strictObject({ itemID: z.string().min(1), isPinned: z.boolean() }))
        .output(z.object({ itemID: z.string(), isPinned: z.boolean() })),
    },
    consolidation: {
      read: memory.output(consolidationDiffSchema.nullable()),

      // Approves the changes each answer names, one, several or the whole diff, each change its
      // own approval record. A refused change applies nothing and leaves the rest to go on.
      approve: memory
        .input(z.strictObject({ answers: z.array(changeAnswerSchema).min(1).max(30) }))
        .output(z.object({ outcomes: z.array(changeOutcomeSchema) })),
      reject: memory.input(changeAnswerSchema).output(z.object({ changeID: z.string() })),
    },
  },
};
