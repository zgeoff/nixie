import { readOpenProposals } from '@heynixie/proposals';
import { answerLegacyProposal } from './answer-legacy-proposal';
import type { ProposalAPIContext } from './build-proposal-core-deps';

const causes = { server: 'mcp_config', tool: 'mcp_allow' } as const;

// Approves each open MCP proposal of the change, as the host's own answer does: it takes no
// passkey, so a test build can answer the server proposals that the approvals page gates behind
// one. Returns how many it approved.
export async function runMcpProposalAnswer(
  context: ProposalAPIContext,
  change: keyof typeof causes,
): Promise<number> {
  const open = await readOpenProposals(context.log.writer.db, context.clock.now());

  const held = open.filter(
    (proposal) => proposal.family === 'mcp' && proposal.cause === causes[change],
  );

  for (const proposal of held) {
    await answerLegacyProposal(context, { runInForceSeed: () => Promise.resolve() }, 'mcp', {
      proposalID: proposal.id,
      choice: 'approve',
    });
  }

  return held.length;
}
