import { loadSkillVersions, readDefinitionsInForce } from '@heynixie/definitions';
import { readCurrentSkillHashes } from './read-current-skill-hashes';
import { readSkillProposals } from './read-skill-proposals';
import { skillProposalLapseMs } from './skill-proposal-lapse-ms';
import type { PendingSkillProposal, SkillProposalContext } from './types';

export async function readPendingSkillProposals(
  context: Pick<SkillProposalContext, 'log' | 'clock'>,
): Promise<readonly PendingSkillProposal[]> {
  const db = context.log.writer.db;
  const now = context.clock.now();

  const proposals = await readSkillProposals(db);

  const pending = proposals.filter(
    (entry) => entry.outcome === null && entry.proposedAt + skillProposalLapseMs > now,
  );

  if (pending.length === 0) {
    return [];
  }

  const inForce = await readDefinitionsInForce(db);
  const current = await readCurrentSkillHashes(db);

  const refs = inForce?.skills ?? [];

  const versions = await loadSkillVersions(
    db,
    refs.map((ref) => ref.skillHash),
  );

  return pending.map((entry) => {
    const ref = refs.find((candidate) => candidate.name === entry.proposal.name);
    const version = ref === undefined ? undefined : versions.get(ref.skillHash);

    return {
      proposal: entry.proposal,
      thread: entry.thread,
      proposedAt: entry.proposedAt,
      lapseAt: entry.proposedAt + skillProposalLapseMs,
      isStale: (current.get(entry.proposal.name) ?? null) !== entry.proposal.baseHash,
      inForce:
        ref === undefined || version === undefined
          ? null
          : {
              skillHash: version.skillHash,
              origin: ref.origin,
              files: [...version.files].map(([path, text]) => ({ path, text })),
            },
    };
  });
}
