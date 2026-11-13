// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

const rules = mockImplementer.rules;

export const mockActionProposalProcedures = {
  listActionProposals: rules.listActionProposals.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const pending = store.actionProposals.findMany(
      (query) =>
        query.where(
          (proposal) => proposal.status === 'pending' && proposal.lapseAt.getTime() > Date.now(),
        ),
      { orderBy: { createdAt: 'asc' } },
    );

    return {
      proposals: pending.map((proposal) => ({
        proposalID: proposal.proposalID,
        tool: proposal.tool,
        sentence: proposal.sentence,
        destinations: [...proposal.destinations],
        createdAt: proposal.createdAt,
        lapseAt: proposal.lapseAt,
      })),
    };
  }),

  approveActionProposal: rules.approveActionProposal.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    await answerMockActionProposal(options.input.proposalID, 'approved', null, options.errors);

    return { proposalID: options.input.proposalID };
  }),

  rejectActionProposal: rules.rejectActionProposal.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    await answerMockActionProposal(
      options.input.proposalID,
      'rejected',
      options.input.reason,
      options.errors,
    );

    return { proposalID: options.input.proposalID };
  }),
};

interface AnswerErrors {
  readonly NOT_FOUND: () => Error;
  readonly PROPOSAL_CLOSED: () => Error;
}

async function answerMockActionProposal(
  proposalID: string,
  status: 'approved' | 'rejected',
  reason: string | null,
  errors: AnswerErrors,
): Promise<void> {
  const proposal = store.actionProposals.findFirst((query) => query.where({ proposalID }));

  if (proposal === undefined) {
    throw errors.NOT_FOUND();
  }

  if (proposal.status !== 'pending' || proposal.lapseAt.getTime() <= Date.now()) {
    throw errors.PROPOSAL_CLOSED();
  }

  await store.actionProposals.update((query) => query.where({ proposalID }), {
    data: (draft) => {
      draft.status = status;
      draft.reason = reason;
    },
  });
}
