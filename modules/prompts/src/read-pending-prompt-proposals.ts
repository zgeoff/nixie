import { proposalLapseMs } from '@heynixie/proposals';
import { buildPromptOverrideHash } from './build-prompt-override-hash';
import { readPromptProposals } from './read-prompt-proposals';
import type { PendingPromptProposal, PromptAnswerContext } from './types';

export async function readPendingPromptProposals(
  context: Pick<PromptAnswerContext, 'log' | 'clock' | 'readInForce'>,
): Promise<readonly PendingPromptProposal[]> {
  const now = context.clock.now();

  const proposals = await readPromptProposals(context.log.writer.db);

  const pending = proposals.filter(
    (entry) => entry.outcome === null && entry.proposedAt + proposalLapseMs > now,
  );

  const overrides = context.readInForce()?.prompts ?? {};

  return pending.map((entry) => {
    const override = overrides[entry.proposal.promptID];

    return {
      proposal: entry.proposal,
      thread: entry.thread,
      proposedAt: entry.proposedAt,
      lapseAt: entry.proposedAt + proposalLapseMs,
      isStale: buildPromptOverrideHash(override) !== entry.proposal.baseHash,
      inForce: override ?? null,
    };
  });
}
