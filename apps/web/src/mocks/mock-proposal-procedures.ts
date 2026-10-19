import { mockImplementer } from './mock-implementer';
import { readMockPendingProposals } from './read-mock-pending-proposals';
import { requireMockSession } from './require-mock-session';
import type { MockProposalAnswer, MockProposalOutcome } from './write-mock-proposal-answer';
import { writeMockProposalAnswer } from './write-mock-proposal-answer';

const memory = mockImplementer.memory;

// The memory view's proposal procedures over the mock store: the pending proposals, and your
// approvals and rejections of one or several, each answer its own checked action.
export const mockProposalProcedures = {
  // the pending proposals, oldest first, with no proposal past its lapse time or forgotten
  listProposals: memory.listProposals.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { proposals: readMockPendingProposals() };
  }),

  approveProposals: memory.approveProposals.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const outcomes = await writeMockAnswers(
      options.input.answers.map((answer) => ({
        ...answer,
        answer: 'approve',
        identityID: session.sessionID,
      })),
    );

    return { outcomes };
  }),

  rejectProposals: memory.rejectProposals.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const outcomes = await writeMockAnswers(
      options.input.answers.map((answer) => ({
        ...answer,
        answer: 'reject',
        identityID: session.sessionID,
      })),
    );

    return { outcomes };
  }),
};

// each answer in the order given, each after the one before it
async function writeMockAnswers(
  answers: readonly MockProposalAnswer[],
): Promise<MockProposalOutcome[]> {
  const outcomes: MockProposalOutcome[] = [];

  for (const answer of answers) {
    const outcome = await writeMockProposalAnswer(answer);

    outcomes.push(outcome);
  }

  return outcomes;
}
