// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { RuleContext } from '@heynixie/definitions';
import { readProposal } from '@heynixie/proposals';
import type { LegacyCaller } from './answer-legacy-proposal';
import { answerLegacyProposal } from './answer-legacy-proposal';

export type RuleProposalAnswer =
  | { readonly answer: 'approve'; readonly proposalID: string }
  | { readonly answer: 'reject'; readonly proposalID: string; readonly reason: string };

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
  caller?: LegacyCaller,
): Promise<{ readonly proposalID: string }> {
  const row = await readProposal(context.log.writer.db, answer.proposalID);

  // A proposed rule and a mandate share the family but take the passkey, which this route, with no
  // hash and no passkey, cannot give. The row's cause never changes, so a read before the answer
  // holds.
  if (row !== null && row.cause !== 'rule_widening') {
    throw errors.NOT_FOUND({ message: `no rule change proposal has ID ${answer.proposalID}` });
  }

  const parts = caller === undefined ? context : { runInForceSeed: context.runInForceSeed, caller };

  const settlement = await answerLegacyProposal(context, parts, 'rule_change', {
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
