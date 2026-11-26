import { readProposalLapses } from '@heynixie/proposals';
import type { PendingPromptProposal, PromptAnswerContext } from '../types';
import { buildPromptOverrideHash } from './build-prompt-override-hash';
import { readPromptProposals } from './read-prompt-proposals';

export async function readPendingPromptProposals(
  context: Pick<PromptAnswerContext, 'log' | 'clock' | 'readInForce'>,
): Promise<readonly PendingPromptProposal[]> {
  const now = context.clock.now();

  const proposals = await readPromptProposals(context.log.writer.db);

  // A defer moves a lapse, so the shared row holds the time that counts.
  const lapses = await readProposalLapses(
    context.log.writer.db,
    proposals.map((entry) => entry.proposal.proposalID),
  );

  const lapseOf = (entry: (typeof proposals)[number]): number =>
    lapses.get(entry.proposal.proposalID) ?? entry.proposedAt;

  const pending = proposals.filter((entry) => entry.outcome === null && lapseOf(entry) > now);
  const overrides = context.readInForce()?.prompts ?? {};

  return pending.map((entry) => {
    const override = overrides[entry.proposal.promptID];

    return {
      proposal: entry.proposal,
      thread: entry.thread,
      proposedAt: entry.proposedAt,
      lapseAt: lapseOf(entry),
      isStale: buildPromptOverrideHash(override) !== entry.proposal.baseHash,
      inForce: override ?? null,
    };
  });
}
