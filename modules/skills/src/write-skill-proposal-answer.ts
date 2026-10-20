import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { readSkillProposals } from './read-skill-proposals';
import { SkillProposalClosedError } from './skill-proposal-closed-error';
import { SkillProposalHashError } from './skill-proposal-hash-error';
import { skillProposalLapseMs } from './skill-proposal-lapse-ms';
import { SkillProposalNotFoundError } from './skill-proposal-not-found-error';
import { skillsWriteApprovedCodec } from './skills-write-approved-codec';
import { skillsWriteRejectedCodec } from './skills-write-rejected-codec';
import type { SkillProposalAnswer, SkillProposalContext } from './types';

// Records your answer to a skill proposal that still waits for one, on the proposal's thread. The
// check and the record share one write transaction, so 2 answers never both close a proposal. A
// rejection's reason sits in the record's erasable fields.
export async function writeSkillProposalAnswer(
  context: SkillProposalContext,
  answer: SkillProposalAnswer,
): Promise<void> {
  const log = context.log;

  await withWriteTransaction(log.writer, async (tx) => {
    const [state] = await readSkillProposals(tx, [answer.proposalID]);

    if (state === undefined) {
      throw new SkillProposalNotFoundError(answer.proposalID);
    }

    if (state.outcome !== null) {
      throw new SkillProposalClosedError(answer.proposalID, state.outcome);
    }

    if (state.proposedAt + skillProposalLapseMs <= context.clock.now()) {
      throw new SkillProposalClosedError(answer.proposalID, 'lapsed');
    }

    if (state.proposal.skillHash !== answer.skillHash) {
      throw new SkillProposalHashError(answer.proposalID);
    }

    await writeRecordsInTransaction(tx, log, [
      {
        definitions: context.definitions(),
        ...(state.thread === null ? {} : { thread: state.thread }),
        ...buildAnswerFields(answer),
      },
    ]);
  });
}

// the kind, payload and erasable fields of the record that holds the answer
function buildAnswerFields(
  answer: SkillProposalAnswer,
): Pick<RecordInput, 'kind' | 'payload' | 'erasable'> {
  if (answer.answer === 'approve') {
    return {
      kind: 'skills.write_approved',
      payload: skillsWriteApprovedCodec.encode({
        proposalID: answer.proposalID,
        pullRequestURL: answer.pullRequestURL,
      }),
    };
  }

  return {
    kind: 'skills.write_rejected',
    payload: skillsWriteRejectedCodec.encode({ proposalID: answer.proposalID }),
    erasable: { reason: answer.reason },
  };
}
