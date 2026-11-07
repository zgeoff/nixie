import { mockImplementer } from './mock-implementer';
import { readMockRuleProposals } from './read-mock-rule-proposals';
import { requireMockSession } from './require-mock-session';
import { writeMockRuleProposalAnswer } from './write-mock-rule-proposal-answer';

const rules = mockImplementer.rules;

export const mockRuleProcedures = {
  listProposals: rules.listProposals.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { proposals: readMockRuleProposals() };
  }),

  approveProposal: rules.approveProposal.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockRuleProposalAnswer({ answer: 'approve', ...options.input });

    if (result.status === 'refused') {
      throw options.errors[result.code]();
    }

    return { proposalID: result.proposalID };
  }),

  rejectProposal: rules.rejectProposal.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockRuleProposalAnswer({ answer: 'reject', ...options.input });

    if (result.status === 'refused') {
      throw options.errors[result.code]();
    }

    return { proposalID: result.proposalID };
  }),
};
