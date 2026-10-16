import type { Log } from '@heynixie/log';
import type { MemoryProposal } from './gate-types';
import { readEvidenceMessage } from './read-evidence-message';
import { readPendingProposals } from './read-pending-proposals';
import type { StoreParts } from './types';
import type { ViewEvidence, ViewProposal } from './view-types';

// Reads the pending proposals for the memory view, each with its quote inside the message it came
// from. A proposal opens only under its item's key, so a forgotten item's proposal is already gone
// from the list, and never shows the words it came from.
export async function readViewProposals(parts: StoreParts): Promise<readonly ViewProposal[]> {
  const pending = await readPendingProposals(parts);

  return Promise.all(pending.map((proposal) => readProposalEvidence(parts.context.log, proposal)));
}

async function readProposalEvidence(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  proposal: MemoryProposal,
): Promise<ViewProposal> {
  const { evidence: quoted, ...rest } = proposal;

  const evidence: ViewEvidence | null =
    quoted === null
      ? null
      : { ...quoted, message: await readEvidenceMessage(log, quoted.recordSequence) };

  return { ...rest, evidence };
}
