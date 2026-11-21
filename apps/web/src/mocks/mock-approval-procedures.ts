// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { readMockApprovalItems } from './read-mock-approval-items';
import { readMockApprovalProposals } from './read-mock-approval-proposals';
import { readMockUnknownOutcomes } from './read-mock-unknown-outcomes';
import { requireMockSession } from './require-mock-session';
import type { MockApprovalResult } from './write-mock-approval-answer';
import { writeMockApprovalAnswer } from './write-mock-approval-answer';
import { writeMockUnknownOutcomeAnswer } from './write-mock-unknown-outcome-answer';

const approvals = mockImplementer.approvals;

// a 1 by 1 PNG
const mockPhotoPNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

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
      unknownOutcomes: readMockUnknownOutcomes(),
    };
  }),

  readProposals: approvals.readProposals.handler((options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return {
      proposals: readMockApprovalProposals(options.input.proposalIDs, session.sessionID),
    };
  }),

  readImage: approvals.readImage.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return new File([Uint8Array.fromBase64(mockPhotoPNG)], `image-${options.input.imageID}`, {
      type: 'image/png',
    });
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

  answerUnknownOutcome: approvals.answerUnknownOutcome.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const outcome = await writeMockUnknownOutcomeAnswer(options.input);

    if (outcome.status === 'answered') {
      return { actionID: options.input.actionID, choice: options.input.choice };
    }

    if (outcome.status === 'passkey_refused') {
      throw outcome.refusal === 'NO_PASSKEY'
        ? options.errors.NO_PASSKEY()
        : options.errors.PASSKEY_REQUIRED();
    }

    throw options.errors.NOT_ALLOWED({ data: { reason: 'not_waiting' } });
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
