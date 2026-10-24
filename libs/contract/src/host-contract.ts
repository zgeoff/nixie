import { oc } from '@orpc/contract';
import { z } from 'zod';

const versionRefSchema = z.object({ itemID: z.string(), version: z.int().positive() });

const versionTargetSchema = z.strictObject({
  itemID: z.string().min(1),
  version: z.int().positive(),
});

const itemTextSchema = z.string().max(2000).regex(/\S/u);
const proposalOriginSchema = z.enum(['owner', 'conversation', 'task', 'memory_writer']);
const memoryOriginSchema = z.enum([...proposalOriginSchema.options, 'lapse']);
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

  'other',
  'self_note',
  'from_photo',
]);

const proposalSourceSchema = z.object({
  origin: proposalOriginSchema,
  thread: z.string().nullable(),
  proposedAt: z.date(),
});

const pendingProposalSchema = z.object({
  proposalID: z.string(),
  operation: z.enum(['remember', 'retire', 'pin']),
  itemID: z.string(),
  targetVersion: z.int().nullable(),
  isPinned: z.boolean(),
  subject: z.enum(['owner', 'self', 'shared']),

  kind: z.enum(['fact', 'self']),
  reason: reviewReasonSchema,
  actionHash: z.string(),
  origin: proposalOriginSchema,
  source: contentSourceSchema,
  createdAt: z.date(),
  lapseAt: z.date(),
  sources: z.array(proposalSourceSchema),
  text: z.string(),
  quote: z.string().nullable(),
});

const closeMatchSchema = z.object({ itemID: z.string(), version: z.int(), text: z.string() });

const approvalResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('applied'), itemID: z.string(), version: z.int() }),
  z.object({ status: z.literal('close_match'), item: closeMatchSchema }),
]);

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

const itemHistorySchema = z.object({
  itemID: z.string(),
  subject: z.enum(['owner', 'self', 'shared']),

  kind: z.enum(['fact', 'self']),
  state: z.enum(['active', 'retired', 'forgetting', 'forgotten']),
  versions: z.array(historyVersionSchema),
});

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

const proposalAnswerSchema = z.strictObject({
  proposalID: z.string().min(1),
  actionHash: z.string().min(1),
});

const hostSessionSchema = z.object({
  sessionID: z.string(),
  deviceName: z.string(),
  createdAt: z.date(),
  lastUsedAt: z.date(),
});

const subjectCountSchema = z.object({
  owner: z.int().nonnegative(),
  shared: z.int().nonnegative(),
  self: z.int().nonnegative(),
});

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
  PIN_EDIT: { message: 'a pin takes no edited text', status: 400 },
  SELF_NOTE_REFUSED: { message: 'a self-note never takes that change', status: 409 },
});

const skillFileSchema = z.object({ path: z.string(), text: z.string() });

const pendingSkillProposalSchema = z.object({
  proposalID: z.string(),
  name: z.string(),
  skillHash: z.string(),

  baseHash: z.string().nullable(),
  files: z.array(skillFileSchema),

  inForce: z
    .object({
      skillHash: z.string(),
      origin: z.enum(['definitions', 'vendored', 'nixie']),
      files: z.array(skillFileSchema),
    })
    .nullable(),

  untypedToken: z.object({ kind: z.string(), raw: z.string() }).nullable(),
  thread: z.string().nullable(),
  provenance: z.object({ runID: z.string(), callID: z.string(), profile: z.string() }),
  createdAt: z.date(),
  lapseAt: z.date(),

  isStale: z.boolean(),
});

const skillAnswerSchema = z.strictObject({
  proposalID: z.string().min(1),
  skillHash: z.string().min(1),
});

const skills = oc.errors({
  NOT_FOUND: { message: 'nothing has that ID', status: 404 },
  PROPOSAL_HASH: { message: 'the skill hash names other files', status: 409 },
  PROPOSAL_CLOSED: { message: 'the proposal is answered or lapsed', status: 409 },
  STALE_BASE: { message: 'the skill in force moved past the proposal', status: 409 },
  SKILL_CHECK: { message: 'the files fail the seed checks', status: 400 },
  WRONG_STATE: { message: 'the skill nixie wrote is no longer in force', status: 409 },
});

const definitionsSkillSchema = z
  .object({ skillHash: z.string(), origin: z.enum(['definitions', 'vendored']) })
  .nullable();

const writtenSkillSchema = z.object({
  approvalID: z.string(),
  proposalID: z.string(),
  name: z.string(),
  skillHash: z.string(),
  base: definitionsSkillSchema,
  definitions: definitionsSkillSchema,
  isConflict: z.boolean(),

  pullRequestURL: z.url().nullable(),
  approvedAt: z.date(),
});

const promptPartFileSchema = z.object({ path: z.string(), text: z.string() });
const promptEntrySchema = z.record(z.string(), z.string());

const pendingPromptProposalSchema = z.object({
  proposalID: z.string(),
  promptID: z.string(),
  proposalHash: z.string(),

  baseHash: z.string().nullable(),
  entry: promptEntrySchema,
  files: z.array(promptPartFileSchema),
  reason: z.string(),

  inForce: z.object({ parts: promptEntrySchema, template: z.string().nullable() }).nullable(),

  thread: z.string().nullable(),
  provenance: z.object({ runID: z.string(), callID: z.string(), profile: z.string() }),
  createdAt: z.date(),
  lapseAt: z.date(),

  isStale: z.boolean(),
});

const promptAnswerSchema = z.strictObject({
  proposalID: z.string().min(1),
  proposalHash: z.string().min(1),
});

const prompts = oc.errors({
  NOT_FOUND: { message: 'nothing has that ID', status: 404 },
  PROPOSAL_HASH: { message: 'the proposal hash names another override', status: 409 },
  PROPOSAL_CLOSED: { message: 'the proposal is answered or lapsed', status: 409 },
  STALE_BASE: { message: 'the override in force moved past the proposal', status: 409 },
  PROMPT_CHECK: { message: 'the override fails the definitions checks', status: 400 },
});

export const hostContract = {
  reset: oc.output(
    z.object({
      resetAt: z.date(),
      lastSequence: z.int().nonnegative(),
      keptSessions: z.int().nonnegative(),
    }),
  ),
  sessions: {
    issueCode: oc.output(z.object({ code: z.string(), expiresAt: z.date() })),
    list: oc.output(z.array(hostSessionSchema)),

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

      approve: memory
        .input(
          proposalAnswerSchema.extend({
            revisionOf: versionTargetSchema.optional(),
            ignoreCloseMatch: z.boolean().optional(),
            editedText: itemTextSchema.optional(),
          }),
        )
        .output(approvalResultSchema),

      reject: memory
        .input(proposalAnswerSchema.extend({ reason: z.string().max(500).regex(/\S/u).optional() }))
        .output(z.object({ proposalID: z.string() })),
    },

    subjects: memory.output(z.object({ items: subjectCountSchema, proposals: subjectCountSchema })),
    items: {
      read: memory.input(z.strictObject({ itemID: z.string().min(1) })).output(itemHistorySchema),

      edit: memory
        .input(versionTargetSchema.extend({ text: itemTextSchema }))
        .output(versionRefSchema),
      retire: memory.input(versionTargetSchema).output(versionRefSchema),
      restore: memory.input(versionTargetSchema).output(versionRefSchema),

      forget: memory.input(versionTargetSchema).output(z.object({ itemID: z.string() })),
      pin: memory
        .input(z.strictObject({ itemID: z.string().min(1), isPinned: z.boolean() }))
        .output(z.object({ itemID: z.string(), isPinned: z.boolean() })),
    },
    consolidation: {
      read: memory.output(consolidationDiffSchema.nullable()),

      approve: memory
        .input(z.strictObject({ answers: z.array(changeAnswerSchema).min(1).max(30) }))
        .output(z.object({ outcomes: z.array(changeOutcomeSchema) })),
      reject: memory.input(changeAnswerSchema).output(z.object({ changeID: z.string() })),
    },
  },
  skills: {
    proposals: {
      list: skills.output(z.array(pendingSkillProposalSchema)),

      approve: skills
        .input(skillAnswerSchema.extend({ files: z.array(skillFileSchema).min(1).optional() }))
        .output(
          z.object({ proposalID: z.string(), approvalID: z.string(), skillHash: z.string() }),
        ),

      reject: skills
        .input(skillAnswerSchema.extend({ reason: z.string().max(500).regex(/\S/u) }))
        .output(z.object({ proposalID: z.string() })),
    },
    written: {
      list: skills.output(z.array(writtenSkillSchema)),

      resolve: skills
        .input(
          z.strictObject({
            approvalID: z.string().min(1),
            keep: z.enum(['nixie', 'definitions']),
          }),
        )
        .output(z.object({ approvalID: z.string(), keep: z.enum(['nixie', 'definitions']) })),
    },
  },
  prompts: {
    proposals: {
      list: prompts.output(z.array(pendingPromptProposalSchema)),

      approve: prompts
        .input(
          promptAnswerSchema.extend({
            entry: promptEntrySchema.optional(),
            files: z.array(promptPartFileSchema).optional(),
          }),
        )
        .output(
          z.object({ proposalID: z.string(), approvalID: z.string(), proposalHash: z.string() }),
        ),

      reject: prompts
        .input(promptAnswerSchema.extend({ reason: z.string().max(500).regex(/\S/u) }))
        .output(z.object({ proposalID: z.string() })),
    },
  },
};
