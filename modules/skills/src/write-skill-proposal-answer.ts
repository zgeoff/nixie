import type { ParseProblem, ParsedSkill } from '@heynixie/definitions';
import { checkSkillFiles, writeWrittenSkill } from '@heynixie/definitions';
import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { findAnswerRefusal } from './find-answer-refusal';
import { readCurrentSkillHashes } from './read-current-skill-hashes';
import { readSkillProposals } from './read-skill-proposals';
import { SkillProposalCheckError } from './skill-proposal-check-error';
import { skillsWriteApprovedCodec } from './skills-write-approved-codec';
import { skillsWriteRejectedCodec } from './skills-write-rejected-codec';
import type {
  SkillAnswerContext,
  SkillFile,
  SkillProposalAnswer,
  SkillProposalAnswerResult,
  SkillProposalContext,
  SkillProposalState,
} from './types';

export async function writeSkillProposalAnswer(
  context: SkillAnswerContext,
  answer: SkillProposalAnswer,
): Promise<SkillProposalAnswerResult> {
  const log = context.log;

  const result = await withWriteTransaction(log.writer, async (tx) => {
    const state = await readOpenProposal(tx, context, answer);

    if (answer.answer === 'reject') {
      await writeRecordsInTransaction(tx, log, [
        {
          definitions: context.definitions(),
          ...(state.thread === null ? {} : { thread: state.thread }),
          kind: 'skills.write_rejected',
          payload: skillsWriteRejectedCodec.encode({ proposalID: answer.proposalID }),
          erasable: { reason: answer.reason },
        },
      ]);

      return { proposalID: answer.proposalID, approvalID: null, skillHash: null };
    }

    return writeApproval(tx, context, { state, files: answer.files ?? null });
  });

  if (result.approvalID !== null) {
    await context.seedWrittenSkills();
  }

  return result;
}

async function readOpenProposal(
  tx: Transaction<unknown>,
  context: SkillProposalContext,
  answer: SkillProposalAnswer,
): Promise<SkillProposalState> {
  const [state] = await readSkillProposals(tx, [answer.proposalID]);
  const current = await readCurrentSkillHashes(tx);

  const currentHash = state === undefined ? null : (current.get(state.proposal.name) ?? null);
  const refusal = findAnswerRefusal({ answer, state, now: context.clock.now(), currentHash });

  if (refusal !== null) {
    throw refusal;
  }

  invariant(state);

  return state;
}

interface Approval {
  readonly state: SkillProposalState;
  readonly files: readonly SkillFile[] | null;
}

async function writeApproval(
  tx: Transaction<unknown>,
  context: SkillProposalContext,
  approval: Approval,
): Promise<SkillProposalAnswerResult> {
  const proposal = approval.state.proposal;
  const checked = checkSkillFiles(proposal.name, approval.files ?? proposal.files);

  if (isProblemList(checked)) {
    throw new SkillProposalCheckError(proposal.proposalID, checked);
  }

  const approvalID = crypto.randomUUID();
  const approvedAt = context.clock.now();

  await writeWrittenSkill(tx, {
    approvalID,
    proposalID: proposal.proposalID,
    skill: checked,
    approvedAt,
  });

  const record: RecordInput = {
    definitions: context.definitions(),
    ...(approval.state.thread === null ? {} : { thread: approval.state.thread }),
    kind: 'skills.write_approved',
    payload: skillsWriteApprovedCodec.encode({
      proposalID: proposal.proposalID,
      approvalID,
      skillHash: checked.skillHash,
      isEdited: checked.skillHash !== proposal.skillHash,
      approver: 'owner',
      channel: 'host',
    }),
  };

  await writeRecordsInTransaction(tx, context.log, [record]);

  return { proposalID: proposal.proposalID, approvalID, skillHash: checked.skillHash };
}

function isProblemList(
  checked: ParsedSkill | readonly ParseProblem[],
): checked is readonly ParseProblem[] {
  return Array.isArray(checked);
}
