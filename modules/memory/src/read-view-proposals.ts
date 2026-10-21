import type { Log } from '@heynixie/log';
import type { MemoryProposal } from './gate-types';
import { readEvidenceMessage } from './read-evidence-message';
import { readPendingProposals } from './read-pending-proposals';
import type { StoreParts } from './types';
import type { ViewEvidence, ViewProposal } from './view-types';

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
