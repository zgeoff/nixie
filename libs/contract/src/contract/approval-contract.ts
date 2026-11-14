import { z } from 'zod';
import { memoryProposalSchema } from './memory-view-contract';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const choiceSchema = z.enum(['approve', 'always_allow', 'defer', 'decline']);
const stateSchema = z.enum(['pending', 'deferred', 'approved', 'declined', 'lapsed', 'withdrawn']);
const hashesSchema = z.object({ actionHash: z.string(), ruleHash: z.string().nullable() });
const versionSchema = z.int().positive();
const taskSchema = z.object({ id: z.string(), name: z.string() });

const proposalSchema = z.object({
  proposalID: z.string(),
  shortID: z.string(),
  kind: z.enum(['action', 'memory_write', 'internal_change']),
  riskClass: z.enum(['routine', 'always_ask', 'lifting']),
  actionHash: z.string(),
  ruleHash: z.string().nullable(),
  cause: z.string(),
  state: stateSchema,
  createdAt: z.date(),
  lapsesAt: z.date(),
  deadlineAt: z.date().nullable(),
  deferGeneration: z.int().nonnegative(),
  deferUntil: z.date().nullable(),
});

const bodySchema = z.object({
  sentence: z.string(),
  fields: z.record(z.string(), z.string()),
  ruleSentence: z.string().nullable(),
  memory: memoryProposalSchema.optional(),
});

const itemSchema = z.object({
  group: z.enum(['always_ask', 'routine', 'memory', 'deferred']),
  proposal: proposalSchema,
  body: bodySchema,
  task: taskSchema.nullable(),
  choices: z.array(choiceSchema),
});

const deferSettingsSchema = z.object({
  defaultMinutes: z.int().positive(),
  eveningAt: z.string(),
  morningAt: z.string(),
  zone: z.string(),
});

const memoryAnswerSchema = z.object({
  editedText: z.string().optional(),
  revisionOf: z.object({ itemID: z.string(), version: versionSchema }).optional(),
  ignoreCloseMatch: z.boolean().optional(),
});

const answerSchema = z.object({
  proposalID: z.string().min(1).max(200),
  actionHash: z.string().min(1),
  choice: choiceSchema,
  ruleHash: z.string().optional(),
  deferUntil: z.date().optional(),
  note: z.string().min(1).max(500).optional(),
  clientActionID: z.uuid(),
  memory: memoryAnswerSchema.optional(),
});

const ruleRefSchema = z.object({ id: z.string(), revision: versionSchema });
const closeMatchSchema = z.object({ itemID: z.string(), text: z.string(), version: versionSchema });

const approvedSchema = z.object({
  proposalID: z.string(),
  state: z.literal('approved'),
  rule: ruleRefSchema.optional(),
});

const closedSchema = z.object({ proposalID: z.string(), state: z.enum(['declined', 'deferred']) });

const closeMatchResultSchema = z.object({
  proposalID: z.string(),
  state: z.literal('pending'),
  closeMatch: closeMatchSchema,
});

const resultSchema = z.discriminatedUnion('state', [
  approvedSchema,
  closedSchema,
  closeMatchResultSchema,
]);

const refusedSchema = z.object({
  proposalID: z.string(),
  error: z.enum(['CONFLICT', 'CLOSED', 'NOT_ALLOWED']),
  current: hashesSchema.optional(),
  state: stateSchema.optional(),
  reason: z.string().optional(),
});

const answerErrors = signedIn.errors(reusedIDErrors).errors({
  CONFLICT: {
    message: 'The proposal changed since the card showed it',
    status: 409,
    data: z.object({ current: hashesSchema }),
  },
  CLOSED: {
    message: 'The proposal is answered, withdrawn or lapsed',
    status: 409,
    data: z.object({ state: stateSchema }),
  },
  NOT_ALLOWED: {
    message: 'The proposal does not take this answer',
    status: 403,
    data: z.object({ reason: z.string() }),
  },
});

const listedSchema = z.object({ defer: deferSettingsSchema, items: z.array(itemSchema) });
const batchInputSchema = z.object({ answers: z.array(answerSchema).min(1).max(100) });
const batchResultSchema = z.object({ results: z.array(z.union([resultSchema, refusedSchema])) });

export const approvalContract = {
  listItems: signedIn.output(listedSchema),

  answerProposal: answerErrors.input(answerSchema).output(resultSchema),

  answerProposals: signedIn
    .errors(reusedIDErrors)
    .input(batchInputSchema)
    .output(batchResultSchema),
};
