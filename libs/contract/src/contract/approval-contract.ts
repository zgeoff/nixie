import { z } from 'zod';
import { authenticationResponseSchema } from './authentication-response-schema';
import { choiceSchema } from './choice-schema';
import { imageNotFoundError } from './image-not-found-error';
import { memoryProposalSchema } from './memory-view-contract';
import { noPasskeyError } from './no-passkey-error';
import { passkeyFailedError } from './passkey-failed-error';
import { reusedIDErrors } from './reused-id-errors';
import { conditionErrorSchema, ruleConditionSchema } from './rule-condition-schema';
import { signedIn } from './signed-in';
import { tickedPlacesSchema } from './ticked-places-schema';

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
  thread: z.string().nullable(),
  taskID: z.string().nullable(),
  sequence: z.int().positive(),
});

const proposalPackageSchema = z.object({
  name: z.string(),
  version: z.string(),

  // null when the registry leaves the size out
  unpackedBytes: z.int().nonnegative().nullable(),
  publisher: z.string(),

  // the publisher's own words, which the card marks as theirs
  description: z.string(),

  // the registry's sha512, which the approval binds
  integrity: z.string(),
});

const cardConditionSchema = ruleConditionSchema.extend({ rule: z.int().nonnegative() });
const trustAnswerLevels = z.enum(['read', 'act']);

const proposedPlaceSchema = z.object({
  words: z.string(),
  trust: trustAnswerLevels,
  why: z.string(),
});

const bodySchema = z.object({
  sentence: z.string(),
  fields: z.record(z.string(), z.string()),
  ruleSentence: z.string().nullable(),

  // the condition of each rule that the card proposes, with the note and the words; `rule` is the
  // rule's place among the rules the card shows
  ruleConditions: z.array(cardConditionSchema).optional(),

  // each rule whose condition errored on the call, which a call that asks through one shows
  conditionErrors: z.array(conditionErrorSchema).optional(),

  // the IDs of stored images the card shows, such as the photos a draw would send
  images: z.array(z.string()).optional(),

  // the desktop as it was when a screen click was prepared, and the point the click lands on; the
  // picture is read like an image
  screen: z.object({ x: z.int(), y: z.int(), picture: z.string() }).optional(),
  approveLabel: z.string(),

  // the place of a held call, which the card offers to trust, with the hash of each level's answer
  place: z.object({ words: z.string(), readHash: z.string(), actHash: z.string() }).optional(),

  // the places of a proposal, which the card lists with a tick for each
  places: z.array(proposedPlaceSchema).optional(),
  rule: z.record(z.string(), z.unknown()).optional(),
  memory: memoryProposalSchema.optional(),
  package: proposalPackageSchema.optional(),
});

const itemSchema = z.object({
  group: z.enum(['always_ask', 'routine', 'memory', 'deferred']),
  proposal: proposalSchema,
  body: bodySchema,
  task: taskSchema.nullable(),
  choices: z.array(choiceSchema),
  passkeyChoices: z.array(choiceSchema),
});

const unknownReasonSchema = z.enum([
  'inconclusive',
  'unknown_streak',
  'no_reconcile',
  'key_expired',
  'not_found_ask',
]);

const checkAnswerSchema = z.enum(['found', 'not_found', 'inconclusive']);
const attemptSchema = z.object({ attempt: z.int().nonnegative(), at: z.date() });
const checkSchema = z.object({ answer: checkAnswerSchema, at: z.date() });

const unknownOutcomeSchema = z.object({
  actionID: z.string(),
  tool: z.string(),

  // the action as its proposal showed it
  sentence: z.string(),
  fields: z.record(z.string(), z.string()),
  riskClass: z.enum(['routine', 'always_ask', 'lifting']),
  reason: unknownReasonSchema,
  becameUnknownAt: z.date(),
  attempts: z.array(attemptSchema),
  checks: z.array(checkSchema),
});

const unknownChoiceSchema = z.enum(['happened', 'retry', 'drop']);

const unknownItemSchema = z.object({
  group: z.literal('unknown_outcome'),
  action: unknownOutcomeSchema,
  task: taskSchema.nullable(),
  choices: z.array(unknownChoiceSchema),
  passkeyChoices: z.array(unknownChoiceSchema),
});

const callSchema = z.object({
  state: z.enum(['waiting', 'applied', 'failed', 'unknown']),
  reason: z.string().nullable(),
});

const readItemSchema = z.object({
  proposal: proposalSchema,
  body: bodySchema.nullable(),
  task: taskSchema.nullable(),
  choices: z.array(choiceSchema),
  passkeyChoices: z.array(choiceSchema),
  answeredOn: z.string().nullable(),
  isAnsweredHere: z.boolean(),

  // what became of the call an approved action row queued; null for any other row
  call: callSchema.nullable(),
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

  // Trusts the place of the held call beside the approval, with the place hash the card showed for
  // that level. A trust of the place to act takes the passkey check.
  trust: trustAnswerLevels.optional(),
  placeHash: z.string().optional(),

  // the places of a proposal card that stay ticked, by their place in its list; absent ticks all
  tickedPlaces: tickedPlacesSchema.optional(),
  deferUntil: z.date().optional(),
  note: z.string().min(1).max(500).optional(),
  clientActionID: z.uuid(),
  memory: memoryAnswerSchema.optional(),
});

const passkeyAnswerSchema = answerSchema.extend({
  passkey: authenticationResponseSchema.optional(),
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
  error: z.enum(['CONFLICT', 'CLOSED', 'NOT_ALLOWED', 'PASSKEY_REQUIRED']),
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
  PASSKEY_REQUIRED: { message: 'This answer needs a passkey check', status: 403 },
  ...noPasskeyError,
  ...passkeyFailedError,
});

const listedSchema = z.object({
  defer: deferSettingsSchema,
  items: z.array(itemSchema),

  // apart from items, so a client of the release before reads every item it knows; a client
  // shows these before every group of items
  unknownOutcomes: z.array(unknownItemSchema),
});

const unknownAnswerSchema = z.object({
  actionID: z.string().min(1).max(200),
  choice: unknownChoiceSchema,
  clientActionID: z.uuid(),
  passkey: authenticationResponseSchema.optional(),
});

const unknownAnswerErrors = signedIn.errors(reusedIDErrors).errors({
  NOT_ALLOWED: {
    message: 'The action waits for no answer about its outcome',
    status: 403,
    data: z.object({ reason: z.string() }),
  },
  PASSKEY_REQUIRED: { message: 'This answer needs a passkey check', status: 403 },
  ...noPasskeyError,
  ...passkeyFailedError,
});

const readInputSchema = z.object({
  proposalIDs: z.array(z.string().min(1).max(200)).min(1).max(100),
});

const batchInputSchema = z.object({ answers: z.array(answerSchema).min(1).max(100) });
const batchResultSchema = z.object({ results: z.array(z.union([resultSchema, refusedSchema])) });

export const approvalContract = {
  listItems: signedIn.output(listedSchema),

  readProposals: signedIn
    .input(readInputSchema)
    .output(z.object({ proposals: z.array(readItemSchema) })),

  // the picture of a stored image that a card shows
  readImage: signedIn
    .errors({ IMAGE_NOT_FOUND: imageNotFoundError })
    .input(z.object({ imageID: z.string().min(1).max(200) }))
    .output(z.file()),

  answerProposal: answerErrors.input(passkeyAnswerSchema).output(resultSchema),

  answerUnknownOutcome: unknownAnswerErrors
    .input(unknownAnswerSchema)
    .output(z.object({ actionID: z.string(), choice: unknownChoiceSchema })),

  answerProposals: signedIn
    .errors(reusedIDErrors)
    .input(batchInputSchema)
    .output(batchResultSchema),
};
