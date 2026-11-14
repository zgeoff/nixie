// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { LogTables } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import type { AnswerSettlement } from '@heynixie/proposals';
import { readProposal } from '@heynixie/proposals';
import type { PendingSkillProposal, SkillAnswerContext } from '@heynixie/skills';
import { readPendingSkillProposals, skillsWriteApprovedCodec } from '@heynixie/skills';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import type { LegacyAnswer } from './answer-legacy-proposal';
import { answerLegacyProposal } from './answer-legacy-proposal';
import { hostImplementer } from './host-implementer';

export function createHostSkillProposalProcedures(context: SkillAnswerContext) {
  const proposals = hostImplementer.skills.proposals;

  return {
    list: proposals.list.handler(async () => {
      const pending = await readPendingSkillProposals(context);

      return pending.map((entry) => buildPendingEntry(entry));
    }),

    approve: proposals.approve.handler(async (options) => {
      const input = options.input;

      const settled = await answerSkillProposal(context, {
        proposalID: input.proposalID,
        actionHash: input.skillHash,
        choice: 'approve',
        ...(input.files === undefined ? {} : { files: input.files }),
      });

      await throwSkillRefusal(context, settled, input, options.errors);

      const approval = await readSkillApproval(context, input.proposalID);

      return { proposalID: input.proposalID, ...approval };
    }),

    reject: proposals.reject.handler(async (options) => {
      const settled = await answerSkillProposal(context, {
        proposalID: options.input.proposalID,
        actionHash: options.input.skillHash,
        choice: 'decline',
        note: options.input.reason,
      });

      await throwSkillRefusal(context, settled, options.input, options.errors);

      return { proposalID: options.input.proposalID };
    }),
  };
}

function buildPendingEntry(entry: PendingSkillProposal) {
  const proposal = entry.proposal;

  return {
    proposalID: proposal.proposalID,
    name: proposal.name,
    skillHash: proposal.skillHash,
    baseHash: proposal.baseHash,
    files: proposal.files.map((file) => ({ path: file.path, text: file.text })),
    inForce:
      entry.inForce === null
        ? null
        : {
            skillHash: entry.inForce.skillHash,
            origin: entry.inForce.origin,
            files: entry.inForce.files.map((file) => ({ path: file.path, text: file.text })),
          },
    untypedToken: proposal.untypedToken,
    thread: entry.thread,
    provenance: proposal.provenance,
    createdAt: new Date(entry.proposedAt),
    lapseAt: new Date(entry.lapseAt),
    isStale: entry.isStale,
  };
}

function answerSkillProposal(context: SkillAnswerContext, answer: LegacyAnswer) {
  return answerLegacyProposal(
    context,
    { runInForceSeed: () => context.seedWrittenSkills() },
    'skill',
    answer,
  );
}

type SkillErrors = Readonly<
  Record<
    'NOT_FOUND' | 'PROPOSAL_HASH' | 'PROPOSAL_CLOSED' | 'STALE_BASE' | 'SKILL_CHECK',
    () => Error
  >
>;

interface SkillAnswerInput {
  readonly proposalID: string;
  readonly skillHash: string;
}

async function throwSkillRefusal(
  context: SkillAnswerContext,
  settled: AnswerSettlement,
  input: SkillAnswerInput,
  errors: SkillErrors,
): Promise<void> {
  if (settled.status === 'answered') {
    return;
  }

  const refusal = settled.refusal;

  if (refusal.error === 'NOT_FOUND') {
    throw errors.NOT_FOUND();
  }

  if (refusal.error === 'CLOSED') {
    throw errors.PROPOSAL_CLOSED();
  }

  if (refusal.error === 'CONFLICT') {
    // The hash the answer names is the proposal's own when the skill in force moved past its base.
    const row = await readProposal(context.log.writer.db, input.proposalID);

    throw errors[row?.actionHash === input.skillHash ? 'STALE_BASE' : 'PROPOSAL_HASH']();
  }

  throw errors.SKILL_CHECK();
}

async function readSkillApproval(context: SkillAnswerContext, proposalID: string) {
  const row = await context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', 'skills.write_approved')
    .where(sql`json_extract(payload, '$.proposalID')`, '=', proposalID)
    .executeTakeFirstOrThrow();

  const approved = skillsWriteApprovedCodec.decode(parseJSONObject(row.payload));

  invariant(approved.approvalID !== undefined && approved.skillHash !== undefined);

  return { approvalID: approved.approvalID, skillHash: approved.skillHash };
}
