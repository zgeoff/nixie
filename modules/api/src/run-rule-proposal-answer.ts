import type { RuleContext, RuleProposalAnswer } from '@heynixie/definitions';
import { writeRuleProposalAnswer } from '@heynixie/definitions';

interface RuleAnswerErrorOptions {
  readonly message: string;
}

type RuleAnswerErrors = Readonly<
  Record<'NOT_FOUND' | 'PROPOSAL_CLOSED' | 'STALE_BASE', (options: RuleAnswerErrorOptions) => Error>
>;

export async function runRuleProposalAnswer(
  context: RuleContext,
  answer: RuleProposalAnswer,
  errors: RuleAnswerErrors,
): Promise<{ readonly proposalID: string }> {
  const result = await writeRuleProposalAnswer(context, answer);

  if (result.status === 'refused') {
    throw errors[result.code]({ message: result.reason });
  }

  return { proposalID: result.proposalID };
}
