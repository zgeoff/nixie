import { faker } from '@faker-js/faker';
import type { ContractOutputs } from '@heynixie/contract';
import { Collection } from '@msw/data';
import { z } from 'zod';
import { mockSequence } from './mock-sequence';

const approvalChoiceSchema = z.enum(['approve', 'always_allow', 'defer', 'decline']);

const approvalStateSchema = z.enum([
  'pending',
  'deferred',
  'approved',
  'declined',
  'lapsed',
  'withdrawn',
]);

const fieldsSchema = z.record(z.string(), z.string());
const choicesSchema = z.array(approvalChoiceSchema);
const imagesSchema = z.array(z.string());

type ApprovalChoice = z.infer<typeof approvalChoiceSchema>;

const closeMatchSchema = z.object({
  itemID: z.string(),
  text: z.string(),
  version: z.int().positive(),
});

const callSchema = z.object({
  state: z.enum(['waiting', 'applied', 'failed', 'unknown']),
  reason: z.string().nullable(),
});

const fieldsRuleSchema = z.record(z.string(), z.unknown());
const ruleRefSchema = z.object({ destinations: z.array(z.string()), ruleID: z.string() });

type ApprovalMemory = NonNullable<
  Extract<
    ContractOutputs['approvals']['listItems']['items'][number],
    { readonly group: 'always_ask' | 'routine' | 'memory' | 'deferred' }
  >['body']['memory']
>;

// A shared approval row with its body, as the host's approvals procedures return it. A row names
// the session that answered it, and the rule that its Always allow adds.
export const approvalRows = new Collection({
  schema: z.object({
    actionHash: z
      .string()
      .default(
        () => `sha256:${faker.string.hexadecimal({ casing: 'lower', length: 64, prefix: '' })}`,
      ),
    answeredBy: z.uuid().nullable().default(null),
    appliedText: z.string().optional(),
    approveLabel: z.string().default('Run mail.send'),

    // what became of the call an approved action row queued
    call: callSchema.nullable().default(null),
    cause: z.string().default('no_rule'),
    choices: choicesSchema.default((): ApprovalChoice[] => ['approve', 'defer', 'decline']),
    closeMatch: closeMatchSchema.optional(),
    createdAt: z.date().default(() => faker.date.recent()),
    deadlineAt: z.date().nullable().default(null),
    deferGeneration: z.int().nonnegative().default(0),
    deferUntil: z.date().nullable().default(null),
    fields: fieldsSchema.default(() => ({})),
    isBodyGone: z.boolean().default(false),
    kind: z.enum(['action', 'memory_write', 'internal_change']).default('action'),
    lapsesAt: z.date().default(() => faker.date.soon({ days: 3 })),
    memory: z.custom<ApprovalMemory>().optional(),
    images: imagesSchema.optional(),
    proposalID: z.uuid().default(() => faker.string.uuid()),
    riskClass: z.enum(['routine', 'always_ask', 'lifting']).default('routine'),
    rule: ruleRefSchema.optional(),

    // the rule form of a proposed rule, which its card opens in Edit
    proposedRule: fieldsRuleSchema.optional(),
    ruleHash: z.string().nullable().default(null),
    ruleSentence: z.string().nullable().default(null),
    sentence: z.string().default('Run mail.send (send).'),
    sequence: z.int().default(() => {
      mockSequence.lastSequence += 1;

      return mockSequence.lastSequence;
    }),
    shortID: z.string().default(buildMockProposalID),
    state: approvalStateSchema.default('pending'),
    taskID: z.string().nullable().default(null),
    thread: z.string().nullable().default('conversation'),
  }),
});

function buildMockProposalID(): string {
  return faker.string.alphanumeric(10).toLowerCase();
}
