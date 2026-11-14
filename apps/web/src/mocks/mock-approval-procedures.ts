// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

const approvals = mockImplementer.approvals;

// The mock server holds no shared approval rows: the client lists nothing and refuses every answer.
export const mockApprovalProcedures = {
  listItems: approvals.listItems.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return {
      defer: {
        defaultMinutes: 60,
        eveningAt: '18:00',
        morningAt: '08:00',
        zone: 'Australia/Sydney',
      },
      items: [],
    };
  }),

  answerProposal: approvals.answerProposal.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.NOT_ALLOWED({ data: { reason: 'not_found' } });
  }),

  answerProposals: approvals.answerProposals.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return {
      results: options.input.answers.map((answer) => ({
        proposalID: answer.proposalID,
        error: 'NOT_ALLOWED' as const,
        reason: 'not_found',
      })),
    };
  }),
};
