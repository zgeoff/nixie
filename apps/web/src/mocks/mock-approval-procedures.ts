// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { readMockApprovalItems } from './read-mock-approval-items';
import { readMockApprovalProposals } from './read-mock-approval-proposals';
import { requireMockSession } from './require-mock-session';
import type { MockApprovalResult } from './write-mock-approval-answer';
import { writeMockApprovalAnswer } from './write-mock-approval-answer';

const approvals = mockImplementer.approvals;

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
      items: readMockApprovalItems(),
    };
  }),

  readProposals: approvals.readProposals.handler((options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return {
      proposals: readMockApprovalProposals(options.input.proposalIDs, session.sessionID),
    };
  }),

  answerProposal: approvals.answerProposal.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const outcome = await writeMockApprovalAnswer(options.input, session.sessionID);

    if (outcome.status === 'answered') {
      return outcome.result;
    }

    if (outcome.status === 'passkey_refused') {
      throw outcome.refusal === 'NO_PASSKEY'
        ? options.errors.NO_PASSKEY()
        : options.errors.PASSKEY_REQUIRED();
    }

    const refusal = outcome.refusal;

    if (refusal.error === 'CONFLICT') {
      throw options.errors.CONFLICT({ data: { current: refusal.current } });
    }

    if (refusal.error === 'CLOSED') {
      throw options.errors.CLOSED({ data: { state: refusal.state } });
    }

    throw options.errors.NOT_ALLOWED({ data: { reason: refusal.reason } });
  }),

  answerProposals: approvals.answerProposals.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    const results = [];

    for (const answer of options.input.answers) {
      const outcome = await writeMockApprovalAnswer(answer, session.sessionID);

      results.push(toBatchResult(answer.proposalID, outcome));
    }

    return { results };
  }),
};

function toBatchResult(proposalID: string, outcome: MockApprovalResult) {
  if (outcome.status === 'answered') {
    return outcome.result;
  }

  if (outcome.status === 'passkey_refused') {
    return { proposalID, error: 'PASSKEY_REQUIRED' as const };
  }

  const refusal = outcome.refusal;

  if (refusal.error === 'CONFLICT') {
    return { proposalID, error: 'CONFLICT' as const, current: refusal.current };
  }

  if (refusal.error === 'CLOSED') {
    return { proposalID, error: 'CLOSED' as const, state: refusal.state };
  }

  return { proposalID, error: 'NOT_ALLOWED' as const, reason: refusal.reason };
}
