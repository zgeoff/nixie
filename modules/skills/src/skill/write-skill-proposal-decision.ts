import type { ParseProblem, ParsedSkill } from '@heynixie/definitions';
import { checkSkillFiles, writeWrittenSkill } from '@heynixie/definitions';
import type { RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { SkillProposalCheckError } from '../proposal/skill-proposal-check-error';
import type {
  SkillFile,
  SkillProposalAnswer,
  SkillProposalAnswerResult,
  SkillProposalContext,
  SkillProposalState,
} from '../types';
import { skillsWriteApprovedCodec } from '../write/skills-write-approved-codec';

// The records of an answer, once the checks passed. The shared answer path calls it too, with its
// own checks of the state and the lapse.
export function writeSkillProposalDecision(
  tx: Transaction<unknown>,
  context: SkillProposalContext,
  state: SkillProposalState,
  answer: SkillProposalAnswer,
): Promise<SkillProposalAnswerResult> {
  if (answer.answer === 'reject') {
    return Promise.resolve({ proposalID: answer.proposalID, approvalID: null, skillHash: null });
  }

  return writeApproval(tx, context, {
    state,
    files: answer.files ?? null,
    identityID: answer.identityID ?? null,
  });
}

interface Approval {
  readonly state: SkillProposalState;
  readonly files: readonly SkillFile[] | null;
  readonly identityID: string | null;
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
      ...(approval.identityID === null ? {} : { identityID: approval.identityID }),
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
