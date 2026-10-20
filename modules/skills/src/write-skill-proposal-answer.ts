import type { ParseProblem, ParsedSkill } from '@heynixie/definitions';
import { checkSkillFiles, readDefinitionsInForce, writeWrittenSkill } from '@heynixie/definitions';
import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { findAnswerRefusal } from './find-answer-refusal';
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

// The proposal the answer names, once findAnswerRefusal finds no reason to refuse the answer.
async function readOpenProposal(
  tx: Transaction<unknown>,
  context: SkillProposalContext,
  answer: SkillProposalAnswer,
): Promise<SkillProposalState> {
  const [state] = await readSkillProposals(tx, [answer.proposalID]);

  const currentHash = state === undefined ? null : await readCurrentHash(tx, state.proposal.name);
  const refusal = findAnswerRefusal({ answer, state, now: context.clock.now(), currentHash });

  if (refusal !== null) {
    throw refusal;
  }

  // findAnswerRefusal refuses an answer to a proposal no record holds
  invariant(state);

  return state;
}

// the version of the skill in force, or null when none is
async function readCurrentHash(tx: Transaction<unknown>, name: string): Promise<string | null> {
  const inForce = await readDefinitionsInForce(tx);

  return inForce?.skills.find((skill) => skill.name === name)?.skillHash ?? null;
}

// the open proposal an approval closes, and your edited files, or null to apply the proposal's
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
