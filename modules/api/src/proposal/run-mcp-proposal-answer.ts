import { readOpenProposals } from '@heynixie/proposals';
import { answerLegacyProposal } from './answer-legacy-proposal';
import type { ProposalAPIContext } from './build-proposal-core-deps';

export interface McpProposalAnswers {
  readonly approved: number;
  readonly refused: readonly string[];
}

const causes = { server: 'mcp_config', tool: 'mcp_allow' } as const;

// Approves each open MCP proposal of the change, as the host's own answer does: it takes no
// passkey, so a test build can answer the server proposals that the approvals page gates behind
// one. Returns how many the answers accepted, and the error of each one the answer refused.
export async function runMcpProposalAnswer(
  context: ProposalAPIContext,
  change: keyof typeof causes,
): Promise<McpProposalAnswers> {
  const open = await readOpenProposals(context.log.writer.db, context.clock.now());

  const held = open.filter(
    (proposal) => proposal.family === 'mcp' && proposal.cause === causes[change],
  );

  let approved = 0;
  const refused: string[] = [];

  for (const proposal of held) {
    const settlement = await answerLegacyProposal(
      context,
      { runInForceSeed: () => Promise.resolve() },
      'mcp',
      { proposalID: proposal.id, choice: 'approve' },
    );

    if (settlement.status === 'answered') {
      approved += 1;
    } else {
      refused.push(settlement.refusal.error);
    }
  }

  return { approved, refused };
}
