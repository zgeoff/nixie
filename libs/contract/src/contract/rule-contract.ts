import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const ruleIDSchema = z.string().min(1).max(200);
const revisionSchema = z.int().positive();

const ruleSchema = z.object({
  ruleID: z.string(),
  revision: revisionSchema,
  sentence: z.string(),
  outcome: z.enum(['allow', 'ask', 'deny']),
  destinations: z.array(z.string()),
});

const notFound = { NOT_FOUND: { message: 'No rule has this ID', status: 404 } };

const ruleChange = signedIn.errors(reusedIDErrors).errors({
  ...notFound,
  CONFLICT: {
    message: 'The rule changed since the notice showed it',
    status: 409,
    data: z.object({ revision: revisionSchema }),
  },
  NOT_ALLOWED: {
    message: 'The rule takes no such change',
    status: 403,
    data: z.object({ reason: z.enum(['widens', 'empty', 'mandate']) }),
  },
});

const currentHashSchema = z.object({ current: z.object({ actionHash: z.string() }) });

const closedStateSchema = z.object({
  state: z.enum(['approved', 'declined', 'lapsed', 'withdrawn']),
});

const proposalIDSchema = z.string().min(1).max(64);
const ruleFormSchema = z.record(z.string(), z.unknown());
const mandateRuleSchema = z.object({ ruleID: z.string(), sentence: z.string() });

const mandateSchema = z.object({
  mandateID: z.string(),
  title: z.string().nullable(),
  rules: z.array(mandateRuleSchema),
  startedAt: z.date(),
  expires: z.date(),
});

const expiryRefusalSchema = z.discriminatedUnion('reason', [
  z.object({ reason: z.literal('expires_past'), now: z.string() }),
  z.object({
    reason: z.literal('expires_beyond_max'),
    maxHours: z.number(),
    latestExpiry: z.string(),
  }),
]);

const faultsSchema = z.object({
  faults: z.array(z.string()),
  expiry: expiryRefusalSchema.optional(),
});

const invalid = {
  INVALID: {
    message: 'The rule or the mandate breaks the rule format or its limits',
    status: 400,
    data: faultsSchema,
  },
};

const destinationsSchema = z.array(z.string().regex(/^\S+$/u)).max(100);

export const ruleContract = {
  readRule: signedIn
    .errors(notFound)
    .input(z.object({ ruleID: ruleIDSchema }))
    .output(ruleSchema),

  removeRule: ruleChange
    .input(z.object({ ruleID: ruleIDSchema, revision: revisionSchema, clientActionID: z.uuid() }))
    .output(z.object({ ruleID: z.string() })),

  editRule: ruleChange
    .input(
      z.object({
        ruleID: ruleIDSchema,
        revision: revisionSchema,
        destinations: destinationsSchema,
        clientActionID: z.uuid(),
      }),
    )
    .output(z.object({ ruleID: z.string(), revision: revisionSchema })),

  editProposedRule: signedIn
    .errors(reusedIDErrors)
    .errors({
      ...invalid,
      NOT_FOUND: { message: 'No proposed rule has this ID', status: 404 },
      CONFLICT: {
        message: 'The proposed rule changed since the card showed it',
        status: 409,
        data: currentHashSchema,
      },
      CLOSED: {
        message: 'The proposed rule is no longer open',
        status: 409,
        data: closedStateSchema,
      },
    })
    .input(
      z.object({
        proposalID: proposalIDSchema,
        actionHash: z.string(),
        rule: ruleFormSchema,
        clientActionID: z.uuid(),
      }),
    )
    .output(z.object({ proposalID: z.string() })),

  proposeMandate: signedIn
    .errors(reusedIDErrors)
    .errors(invalid)
    .input(
      z.object({
        title: z.string(),
        rules: z.array(ruleFormSchema),
        expires: z.string().optional(),
        clientActionID: z.uuid(),
      }),
    )
    .output(z.object({ proposalID: z.string(), mandateID: z.string(), expires: z.date() })),

  listMandates: signedIn.output(z.object({ mandates: z.array(mandateSchema) })),

  endMandate: signedIn
    .errors(reusedIDErrors)
    .errors({ NOT_FOUND: { message: 'No mandate has this ID', status: 404 } })
    .input(z.object({ mandateID: z.string().min(1).max(64), clientActionID: z.uuid() }))
    .output(z.object({ mandateID: z.string(), state: z.enum(['ended', 'expired']) })),
};
