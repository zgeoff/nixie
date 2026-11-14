import { createHash } from 'node:crypto';
import { writeRecordsInTransaction } from '@heynixie/log';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import { proposalLapseMs } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { readCurrentSkillHashes } from './read-current-skill-hashes';
import { readSkillProposals } from './read-skill-proposals';
import { SkillProposalCheckError } from './skill-proposal-check-error';
import { skillsWriteLapsedCodec } from './skills-write-lapsed-codec';
import type { SkillAnswerContext, SkillProposalAnswer } from './types';
import { writeSkillProposalDecision } from './write-skill-proposal-answer';

export function makeSkillProposalHandler(context: SkillAnswerContext): ProposalKindHandler {
  return {
    family: 'skill',
    lapseIntervalMs: proposalLapseMs,
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
    decline: (run, row, answer) => writeAnswer(context, run, row, answer),
    lapse: async (tx, row) => {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: skillsWriteLapsedCodec.kind,
          definitions: context.definitions(),
          ...(row.thread === null ? {} : { thread: row.thread }),
          payload: skillsWriteLapsedCodec.encode({ proposalID: row.id }),
        },
      ]);
    },
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

  const isDeclined = answer.choice === 'decline';

  const decision: SkillProposalAnswer = isDeclined
    ? {
        answer: 'reject',
        proposalID: row.id,
        skillHash: state.proposal.skillHash,
        reason: answer.note ?? '',
      }
    : {
        answer: 'approve',
        proposalID: row.id,
        skillHash: state.proposal.skillHash,
        ...(answer.files === undefined ? {} : { files: answer.files }),
      };

  try {
    const decided = await writeSkillProposalDecision(tx, context, state, decision);

    return {
      status: 'done',
      result: { proposalID: decided.proposalID, state: isDeclined ? 'declined' : 'approved' },
      ...(isDeclined ? {} : { afterCommit: () => context.seedWrittenSkills() }),
    };
  } catch (error) {
    if (error instanceof SkillProposalCheckError) {
      return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'skill_check' } };
    }

    throw error;
  }
}
