// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { RuleContext, RuleProposalAnswer } from '@heynixie/definitions';
import { answerLegacyProposal } from './answer-legacy-proposal';

interface RuleAnswerErrorOptions {
  readonly message: string;
}

type RuleAnswerErrors = Readonly<
  Record<'NOT_FOUND' | 'PROPOSAL_CLOSED', (options: RuleAnswerErrorOptions) => Error>
>;

export async function runRuleProposalAnswer(
  context: RuleContext,
  answer: RuleProposalAnswer,
  errors: RuleAnswerErrors,
): Promise<{ readonly proposalID: string }> {
  const settlement = await answerLegacyProposal(context, context, 'rule_change', {
    proposalID: answer.proposalID,
    choice: answer.answer === 'approve' ? 'approve' : 'decline',
    ...(answer.answer === 'reject' ? { note: answer.reason } : {}),
  });

  if (settlement.status === 'answered') {
    return { proposalID: answer.proposalID };
  }

  const refusal = settlement.refusal;

  if (refusal.error === 'NOT_FOUND') {
    throw errors.NOT_FOUND({ message: `no rule change proposal has ID ${answer.proposalID}` });
  }

  const status = refusal.error === 'CLOSED' ? refusal.state : 'moved';

  throw errors.PROPOSAL_CLOSED({
    message: `the rule change proposal ${answer.proposalID} is ${status === 'declined' ? 'rejected' : status}`,
  });
}
