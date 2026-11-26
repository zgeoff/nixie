import { createHash } from 'node:crypto';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import { buildDiscardedOutcome } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { SkillProposalCheckError } from '../proposal/skill-proposal-check-error';
import type { SkillAnswerContext, SkillProposalAnswer } from '../types';
import { readCurrentSkillHashes } from './read-current-skill-hashes';
import { readSkillProposals } from './read-skill-proposals';
import { writeSkillProposalDecision } from './write-skill-proposal-decision';

const dayMs = 24 * 60 * 60 * 1000;

export function makeSkillProposalHandler(context: SkillAnswerContext): ProposalKindHandler {
  return {
    family: 'skill',
    lapseIntervalMs: (config) => config.lapseDays.skill * dayMs,
    ownsTransaction: false,
    readBodies: async (db, rows) => {
      const states = await readSkillProposals(
        db,
        rows.map((row) => row.id),
      );

      const bodies = new Map(
        states.map((state) => [
          state.proposal.proposalID,
          {
            sentence: `Write the skill ${state.proposal.name}.`,
            fields: { files: state.proposal.files.map((file) => file.path).join(', ') },
            ruleSentence: null,
            approveLabel: 'Save the skill',
          },
        ]),
      );

      return new Map(rows.map((row) => [row.id, bodies.get(row.id) ?? null]));
    },
    readHashes: async (db, row) => {
      const [state] = await readSkillProposals(db, [row.id]);
      const current = await readCurrentSkillHashes(db);

      // A skill that moved past the proposal's base makes the proposal's hash stale
      const isStale =
        state !== undefined &&
        (current.get(state.proposal.name) ?? null) !== state.proposal.baseHash;

      return {
        action: isStale
          ? buildStaleHash(row.actionHash, current.get(state.proposal.name))
          : row.actionHash,
        rule: null,
      };
    },
    approve: (run, row, answer) => writeAnswer(context, run, row, answer),
    discard: (_run, row, outcome) => Promise.resolve(buildDiscardedOutcome(row, outcome)),
  };
}

function buildStaleHash(skillHash: string, current: string | undefined): string {
  return createHash('sha256')
    .update(`${skillHash}:${current ?? 'none'}`)
    .digest('hex');
}

async function writeAnswer(
  context: SkillAnswerContext,
  run: ApplyRun,
  row: SharedProposal,
  answer: ProposalAnswerInput,
): Promise<ApplyOutcome> {
  const tx = run.tx;

  invariant(tx, 'a skill proposal answers in the transaction that the core opens');

  const [state] = await readSkillProposals(tx, [row.id]);

  invariant(state, 'a skill proposal has its record');

  const current = await readCurrentSkillHashes(tx);

  if ((current.get(state.proposal.name) ?? null) !== state.proposal.baseHash) {
    return {
      status: 'refused',
      refusal: {
        error: 'CONFLICT',
        current: {
          actionHash: buildStaleHash(row.actionHash, current.get(state.proposal.name)),
          ruleHash: null,
        },
      },
    };
  }

  const decision: SkillProposalAnswer = {
    answer: 'approve',
    proposalID: row.id,
    skillHash: state.proposal.skillHash,
    identityID: answer.identityID,
    ...(answer.files === undefined ? {} : { files: answer.files }),
  };

  try {
    const decided = await writeSkillProposalDecision(tx, context, state, decision);

    return {
      status: 'done',
      result: { proposalID: decided.proposalID, state: 'approved' },
      usedBy: decided.approvalID,
      detail: `call skill_reload with ${state.proposal.name}`,
      otherStakes: [],
      afterCommit: () => context.runInForceSeed(),
    };
  } catch (error) {
    if (error instanceof SkillProposalCheckError) {
      return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'skill_check' } };
    }

    throw error;
  }
}
