import type { Log } from '@heynixie/log';
import { readEvidenceMessage } from '../evidence/read-evidence-message';
import type { MemoryProposal } from '../gate/gate-context';
import { readPendingProposals } from '../proposal/read-pending-proposals';
import type { StoreParts } from '../types';
import type { ViewEvidence, ViewProposal } from './memory-view';

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
