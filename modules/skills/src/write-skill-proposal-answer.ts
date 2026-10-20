import type { ParseProblem, ParsedSkill } from '@heynixie/definitions';
import { checkSkillFiles, readDefinitionsInForce, writeWrittenSkill } from '@heynixie/definitions';
import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { canMoveSkillProposal } from './can-move-skill-proposal';
import { readSkillProposals } from './read-skill-proposals';
import { SkillProposalCheckError } from './skill-proposal-check-error';
import { SkillProposalClosedError } from './skill-proposal-closed-error';
import { SkillProposalHashError } from './skill-proposal-hash-error';
import { skillProposalLapseMs } from './skill-proposal-lapse-ms';
import { SkillProposalNotFoundError } from './skill-proposal-not-found-error';
import { SkillProposalStaleError } from './skill-proposal-stale-error';
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

// Records your answer to a skill proposal that still waits for one, on the proposal's thread, in
// one write transaction with its checks, so 2 answers never both close a proposal. An approval
// stores the skill as in force, and a seed then puts it in force for the next task.
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

// The proposal the answer names, once it is found, open, under the answer's skill hash, and over
// the version of the skill in force.
async function readOpenProposal(
  tx: Transaction<unknown>,
  context: SkillProposalContext,
  answer: SkillProposalAnswer,
): Promise<SkillProposalState> {
  const [state] = await readSkillProposals(tx, [answer.proposalID]);

  if (state === undefined) {
    throw new SkillProposalNotFoundError(answer.proposalID);
  }

  // a proposal past its lapse time stands lapsed before the sweep records its lapse
  const isPastLapse = state.proposedAt + skillProposalLapseMs <= context.clock.now();
  const status = state.outcome ?? (isPastLapse ? 'lapsed' : 'pending');
  const outcome = answer.answer === 'approve' ? 'approved' : 'rejected';

  if (!canMoveSkillProposal(status, outcome)) {
    throw new SkillProposalClosedError(answer.proposalID, status);
  }

  if (state.proposal.skillHash !== answer.skillHash) {
    throw new SkillProposalHashError(answer.proposalID);
  }

  const inForce = await readDefinitionsInForce(tx);

  const current = inForce?.skills.find((skill) => skill.name === state.proposal.name);

  if ((current?.skillHash ?? null) !== state.proposal.baseHash) {
    throw new SkillProposalStaleError(answer.proposalID);
  }

  return state;
}

// the open proposal an approval closes, and your edited files, or null to apply the proposal's
interface Approval {
  readonly state: SkillProposalState;
  readonly files: readonly SkillFile[] | null;
}

// Checks the files the approval applies, the proposal's or your edit of them, stores the skill as
// in force under a new approval ID, and records the approval.
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
