import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';
import { store } from './store';
import type { MockProposalAnswer, MockProposalOutcome } from './write-mock-proposal-answer';
import { writeMockProposalAnswer } from './write-mock-proposal-answer';

const memory = mockImplementer.memory;

// The memory view's proposal procedures over the mock store: the pending proposals, and your
// approvals and rejections of one or several, each answer its own checked action.
export const mockProposalProcedures = {
  // the pending proposals, oldest first, with no proposal past its lapse time
  listProposals: memory.listProposals.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const pending = store.memoryProposals.findMany(
      (query) =>
        query.where(
          (proposal) => proposal.status === 'pending' && proposal.lapseAt.getTime() > Date.now(),
        ),
      { orderBy: { createdAt: 'asc' } },
    );

    return {
      proposals: pending.map((proposal) => ({
        actionHash: proposal.actionHash,
        createdAt: proposal.createdAt,
        evidence: proposal.evidence === null ? null : structuredClone(proposal.evidence),
        isPinned: proposal.isPinned,
        itemID: proposal.itemID,
        lapseAt: proposal.lapseAt,
        operation: proposal.operation,
        origin: proposal.origin,
        proposalID: proposal.proposalID,
        quote: proposal.quote,
        reason: proposal.reason,
        source: proposal.source,
        sources: [
          { origin: proposal.origin, proposedAt: proposal.createdAt, thread: proposal.thread },
        ],
        targetVersion: proposal.targetVersion,
        text: proposal.text,
      })),
    };
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
