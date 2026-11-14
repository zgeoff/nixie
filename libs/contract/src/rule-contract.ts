import { z } from 'zod';
import { signedIn } from './signed-in';

const ruleVersionSchema = z.object({ ruleHash: z.string(), sentence: z.string() }).nullable();

const ruleChangeSchema = z.object({
  ruleID: z.string(),
  before: ruleVersionSchema,
  after: ruleVersionSchema,
});

const effectChangeSchema = z.object({
  tool: z.string(),
  remove: z.array(z.string()),
  sentence: z.string(),
});

const ruleProposalSchema = z.object({
  proposalID: z.string(),
  changes: z.array(ruleChangeSchema),
  effectChanges: z.array(effectChangeSchema),
  createdAt: z.date(),
  lapseAt: z.date(),
});

const actionProposalSchema = z.object({
  proposalID: z.string(),
  tool: z.string(),
  sentence: z.string(),
  destinations: z.array(z.string()),
  createdAt: z.date(),
  lapseAt: z.date(),
});

const ruleAnswer = signedIn.errors({
  NOT_FOUND: { message: 'No rule change proposal has this ID', status: 404 },
  PROPOSAL_CLOSED: {
    message: 'The rule change proposal is answered, withdrawn or lapsed',
    status: 409,
  },
});

const proposalIDSchema = z.string().min(1).max(200);

export const ruleContract = {
  listProposals: signedIn.output(z.object({ proposals: z.array(ruleProposalSchema) })),

  approveProposal: ruleAnswer
    .input(z.object({ proposalID: proposalIDSchema }))
    .output(z.object({ proposalID: z.string() })),

  rejectProposal: ruleAnswer
    .input(z.object({ proposalID: proposalIDSchema, reason: z.string().max(500).regex(/\S/u) }))
    .output(z.object({ proposalID: z.string() })),

  listActionProposals: signedIn.output(z.object({ proposals: z.array(actionProposalSchema) })),

  approveActionProposal: ruleAnswer
    .input(z.object({ proposalID: proposalIDSchema }))
    .output(z.object({ proposalID: z.string() })),

  rejectActionProposal: ruleAnswer
    .input(z.object({ proposalID: proposalIDSchema, reason: z.string().max(500).regex(/\S/u) }))
    .output(z.object({ proposalID: z.string() })),
};
