import { createHash } from 'node:crypto';
import { writeRecordsInTransaction } from '@heynixie/log';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import { buildDiscardedOutcome } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { promptsOverrideApprovedCodec } from '../override/prompts-override-approved-codec';
import type {
  PromptAnswerContext,
  PromptPartFile,
  PromptProposalState,
  PromptsTables,
} from '../types';
import { buildPromptOverrideHash } from './build-prompt-override-hash';
import { buildPromptProposalHash } from './build-prompt-proposal-hash';
import { readPromptProposals } from './read-prompt-proposals';
import { writePromptApprovalState } from './write-prompt-approval-state';

const dayMs = 24 * 60 * 60 * 1000;

// The handler of the prompt family. A prompt override always asks, so approving it takes a passkey.
// Its hash covers the override and, through readHashes, the base it replaces, so an approval after
// the override in force moved is refused.
export function makePromptProposalHandler(context: PromptAnswerContext): ProposalKindHandler {
  return {
    family: 'prompt',
    lapseIntervalMs: (config) => config.lapseDays.prompt * dayMs,
    ownsTransaction: false,
    readBodies: async (db, rows) => {
      const states = await readPromptProposals(
        db,
        rows.map((row) => row.id),
      );

      const bodies = new Map(
        states.map((state) => [
          state.proposal.proposalID,
          {
            sentence: `Override the prompt ${state.proposal.promptID}.`,
            fields: {
              reason: state.proposal.reason,
              files: state.proposal.files.map((file) => file.path).join(', '),
            },
            ruleSentence: null,
            approveLabel: 'Approve the override',
          },
        ]),
      );

      return new Map(rows.map((row) => [row.id, bodies.get(row.id) ?? null]));
    },
    readHashes: async (db, row) => {
      const [state] = await readPromptProposals(db, [row.id]);

      const isStale =
        state !== undefined &&
        buildPromptOverrideHash(context.readInForce()?.prompts[state.proposal.promptID]) !==
          state.proposal.baseHash;

      return { action: isStale ? buildStaleHash(row.actionHash) : row.actionHash, rule: null };
    },
    approve: (run, row, answer) => writeApproval(context, run, row, answer),
    discard: (_run, row, outcome) => Promise.resolve(buildDiscardedOutcome(row, outcome)),
  };
}

function buildStaleHash(actionHash: string): string {
  return createHash('sha256').update(`${actionHash}:stale`).digest('hex');
}

async function writeApproval(
  context: PromptAnswerContext,
  run: ApplyRun,
  row: SharedProposal,
  answer: ProposalAnswerInput,
): Promise<ApplyOutcome> {
  const tx = run.tx;

  invariant(tx, 'a prompt proposal answers in the transaction that the core opens');

  const [state] = await readPromptProposals(tx, [row.id]);

  invariant(state, 'a prompt proposal has its record');

  const proposal = state.proposal;
  const entry = answer.prompt?.entry ?? proposal.entry;
  const files = answer.prompt?.files ?? proposal.files;
  const problems = context.checkProposal({ id: proposal.promptID, entry, files });

  if (problems.length > 0) {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'prompt_check' } };
  }

  const approvalID = await writePromptApproval(tx, context, {
    state,
    entry,
    files,
    identityID: answer.identityID,
  });

  return {
    status: 'done',
    result: { proposalID: row.id, state: 'approved' },
    usedBy: approvalID,
    detail:
      'nixie opens a pull request to the definitions repo with it, and the override applies only ' +
      'after that pull request merges and live is promoted',
    otherThreads: [],
  };
}

interface Approval {
  readonly state: PromptProposalState;
  readonly entry: Readonly<Record<string, string>>;
  readonly files: readonly PromptPartFile[];
  readonly identityID: string;
}

// Writes the approval of an override: the row in force, the one it supersedes and the record.
export async function writePromptApproval(
  tx: Transaction<unknown>,
  context: PromptAnswerContext,
  approval: Approval,
): Promise<string> {
  const proposal = approval.state.proposal;

  const proposalHash = buildPromptProposalHash({
    promptID: proposal.promptID,
    entry: approval.entry,
    files: approval.files,
  });

  const approvalID = crypto.randomUUID();
  const approvedAt = context.clock.now();
  const tables = tx.$extendTables<PromptsTables>();

  const current = await tables
    .selectFrom('prompt_approvals')
    .select('approval_id')
    .where('prompt_id', '=', proposal.promptID)
    .where('state', '=', 'current')
    .execute();

  for (const row of current) {
    await writePromptApprovalState(tx, {
      approvalID: row.approval_id,
      to: 'superseded',
      at: approvedAt,
    });
  }

  await tables
    .insertInto('prompt_approvals')
    .values({
      approval_id: approvalID,
      proposal_id: proposal.proposalID,
      prompt_id: proposal.promptID,
      thread: approval.state.thread,
      entry: JSON.stringify(approval.entry),
      files: JSON.stringify(approval.files),
      state: 'current',
      approved_at: approvedAt,
      updated_at: approvedAt,
    })
    .execute();

  await writeRecordsInTransaction(tx, context.log, [
    {
      definitions: context.definitions(),
      ...(approval.state.thread === null ? {} : { thread: approval.state.thread }),
      kind: 'prompts.override_approved',
      payload: promptsOverrideApprovedCodec.encode({
        proposalID: proposal.proposalID,
        approvalID,
        proposalHash,
        isEdited: proposalHash !== proposal.proposalHash,
        approver: 'owner',
        channel: 'host',
        identityID: approval.identityID,
      }),
    },
  ]);

  return approvalID;
}
