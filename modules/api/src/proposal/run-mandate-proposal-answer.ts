import { readOpenProposals } from '@heynixie/proposals';
import { answerLegacyProposal } from './answer-legacy-proposal';
import type { ProposalAPIContext } from './build-proposal-core-deps';

export interface MandateProposalAnswers {
  readonly approved: number;
  readonly refused: readonly string[];
}

// Approves each open mandate proposal with the passkey exemption of a host answer, so a test build
// can answer the mandate proposals that the approvals page gates behind a passkey. No host command
// answers a mandate. Returns how many the answers accepted, and the error of each one refused.
export async function runMandateProposalAnswer(
  context: ProposalAPIContext,
  runInForceSeed: () => Promise<unknown>,
): Promise<MandateProposalAnswers> {
  const open = await readOpenProposals(context.log.writer.db, context.clock.now());

  const held = open.filter(
    (proposal) => proposal.family === 'rule_change' && proposal.cause === 'mandate',
  );

  let approved = 0;
  const refused: string[] = [];

  for (const proposal of held) {
    const settlement = await answerLegacyProposal(context, { runInForceSeed }, 'rule_change', {
      proposalID: proposal.id,
      choice: 'approve',
    });

    if (settlement.status === 'answered') {
      approved += 1;
    } else {
      refused.push(settlement.refusal.error);
    }
  }

  return { approved, refused };
}
