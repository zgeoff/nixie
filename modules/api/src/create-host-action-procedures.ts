import type { PendingActionProposal } from '@heynixie/policy';
import { buildActionProposalSentence, readPendingActionProposals } from '@heynixie/policy';
import { hostImplementer } from './host-implementer';
import { runActionProposalAnswer } from './run-action-proposal-answer';
import type { APIContext } from './types';
import type { ActionProposalAnswer } from './write-action-proposal-answer';

export function createHostActionProcedures(context: APIContext) {
  const proposals = hostImplementer.actions.proposals;

  return {
    proposals: {
      list: proposals.list.handler(async () => {
        const pending = await readPendingActionProposals(context.log, context.clock.now());

        return pending.map((entry) => buildActionProposalEntry(entry));
      }),

      approve: proposals.approve.handler((options) =>
        runAnswer(context, { answer: 'approve', proposalID: options.input.proposalID }, options),
      ),

      reject: proposals.reject.handler((options) =>
        runAnswer(
          context,
          {
            answer: 'reject',
            proposalID: options.input.proposalID,
            reason: options.input.reason ?? null,
          },
          options,
        ),
      ),
    },
  };
}

export function buildActionProposalEntry(entry: PendingActionProposal) {
  return {
    proposalID: entry.shortID,
    tool: entry.tool,
    effects: [...entry.effects],
    cause: entry.cause,
    sentence: buildActionProposalSentence(entry.tool, entry.effects, entry.destinations),
    destinations: [...entry.destinations],
    createdAt: new Date(entry.proposedAt),
    lapseAt: new Date(entry.lapseAt),
  };
}

interface ErrorOptions {
  readonly message: string;
}

interface AnswerOptions {
  readonly errors: Readonly<
    Record<'NOT_FOUND' | 'PROPOSAL_CLOSED', (options: ErrorOptions) => Error>
  >;
}

async function runAnswer(
  context: APIContext,
  answer: ActionProposalAnswer,
  options: AnswerOptions,
): Promise<{ readonly proposalID: string }> {
  const result = await runActionProposalAnswer(context, answer);

  if (result.status === 'refused') {
    throw options.errors[result.code]({ message: result.reason });
  }

  return { proposalID: result.proposalID };
}
