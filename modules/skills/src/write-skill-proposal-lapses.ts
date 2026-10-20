import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { canMoveSkillProposal } from './can-move-skill-proposal';
import { readSkillProposals } from './read-skill-proposals';
import { skillProposalLapseMs } from './skill-proposal-lapse-ms';
import { skillsWriteLapsedCodec } from './skills-write-lapsed-codec';
import type { SkillProposalContext } from './types';

// Records the lapse of each skill proposal that waited past its lapse time with no answer, on the
// proposal's thread, and returns how many lapsed. The read and the records share one write
// transaction, so an answer never lands between them.
export function writeSkillProposalLapses(context: SkillProposalContext): Promise<number> {
  const log = context.log;

  return withWriteTransaction(log.writer, async (tx) => {
    const now = context.clock.now();

    const proposals = await readSkillProposals(tx);

    const lapsed = proposals.filter(
      (entry) =>
        canMoveSkillProposal(entry.outcome ?? 'pending', 'lapsed') &&
        entry.proposedAt + skillProposalLapseMs <= now,
    );

    if (lapsed.length > 0) {
      await writeRecordsInTransaction(
        tx,
        log,
        lapsed.map((entry) => ({
          kind: 'skills.write_lapsed',
          definitions: context.definitions(),
          ...(entry.thread === null ? {} : { thread: entry.thread }),
          payload: skillsWriteLapsedCodec.encode({ proposalID: entry.proposal.proposalID }),
        })),
      );
    }

    return lapsed.length;
  });
}
