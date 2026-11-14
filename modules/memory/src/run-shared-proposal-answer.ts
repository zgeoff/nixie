import { writeRecordsInTransaction } from '@heynixie/log';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalCoreDeps,
  ProposalKindHandler,
  ProposalRefusal,
  SharedProposal,
  SharedProposalState,
} from '@heynixie/proposals';
import { answerProposal, buildProposalsProjection } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type { ApprovalResult, ProposalAnswer, ProposalRejection } from './gate-context';
import { mapMemoryProposalRecord } from './map-memory-proposal-record';
import { MemoryProposalNotFoundError } from './memory-proposal-not-found-error';
import { ProposalClosedError } from './proposal-closed-error';
import { ProposalHashError } from './proposal-hash-error';
import type { StoreParts } from './types';
import { writeProposalApproval } from './write-proposal-approval';
import { writeProposalRejection } from './write-proposal-rejection';

export type SharedMemoryAnswer =
  | { readonly choice: 'approve'; readonly answer: ProposalAnswer }
  | { readonly choice: 'decline'; readonly answer: ProposalRejection };

// the result memory's own write returned, which the shared path's result leaves out
interface AppliedResult {
  result: ApprovalResult | null;
}

const memoryProposalsProjection = buildProposalsProjection([mapMemoryProposalRecord]);

// A memory answer runs the shared checks of every proposal answer, then memory's own write. The
// shared checks refuse with memory's own errors, so callers see the errors they always saw.
export async function runSharedProposalAnswer(
  parts: StoreParts,
  request: SharedMemoryAnswer,
): Promise<ApprovalResult | null> {
  const applied: AppliedResult = { result: null };
  const handler = buildAnswerHandler({ parts, request, applied });

  const deps: ProposalCoreDeps = {
    log: parts.context.log,
    clock: parts.context.gate.clock,
    definitions: parts.context.definitions,
    handlers: new Map([['memory', handler]]),
    projection: memoryProposalsProjection,
    readDeferContext: () => Promise.resolve({ quietHours: null, zone: 'UTC' }),
    writeThreadRecord: async (tx, input) => {
      await writeRecordsInTransaction(tx, parts.context.log, [input]);
    },
  };

  const answer = request.answer;

  const outcome = await answerProposal(
    deps,
    {
      proposalID: answer.proposalID,
      actionHash: answer.actionHash,
      choice: request.choice,
      identityID: answer.identityID,
    },
    { family: 'memory' },
  ).catch((error: unknown) => {
    throw error instanceof CallerWriteError ? error.cause : error;
  });

  invariant(outcome.status !== 'unauthorized', 'a memory answer names no caller check of its own');

  if (outcome.status === 'refused') {
    throw toMemoryError(answer.proposalID, outcome.refusal);
  }

  return applied.result;
}

interface SharedAnswerRun {
  readonly parts: StoreParts;
  readonly request: SharedMemoryAnswer;
  readonly applied: AppliedResult;
}

function buildAnswerHandler(answerRun: SharedAnswerRun): ProposalKindHandler {
  const apply = (run: ApplyRun, row: SharedProposal) => writeAnswer(answerRun, run, row);

  return {
    family: 'memory',
    lapseIntervalMs: 0,
    ownsTransaction: true,
    readBodies: () => Promise.resolve(new Map()),
    readHashes: (_db, row) => Promise.resolve({ action: row.actionHash, rule: null }),
    approve: apply,
    decline: apply,
    lapse: () => Promise.resolve(),
  };
}

// The guard runs first in memory's own write transaction, so the shared checks hold at the commit.
async function writeAnswer(
  answerRun: SharedAnswerRun,
  run: ApplyRun,
  row: SharedProposal,
): Promise<ApplyOutcome> {
  const parts = answerRun.parts;
  const request = answerRun.request;

  const writeInTransaction = async (tx: Transaction<unknown>) => {
    await run.guard(tx);

    try {
      await request.answer.writeInTransaction?.(tx);
    } catch (error) {
      throw new CallerWriteError(error);
    }
  };

  if (request.choice === 'decline') {
    await writeProposalRejection(parts, { ...request.answer, writeInTransaction });

    return { status: 'done', result: { proposalID: row.id, state: 'declined' } };
  }

  const result = await writeProposalApproval(parts, { ...request.answer, writeInTransaction });

  answerRun.applied.result = result;

  return result.status === 'close_match'
    ? { status: 'done', result: { proposalID: row.id, state: 'pending', closeMatch: result.item } }
    : { status: 'done', result: { proposalID: row.id, state: 'approved' } };
}

const memoryStatuses: Readonly<Record<SharedProposalState, string>> = {
  pending: 'pending',
  deferred: 'deferred',
  approved: 'consumed',
  declined: 'rejected',
  lapsed: 'lapsed',
  withdrawn: 'withdrawn',
};

function toMemoryError(proposalID: string, refusal: ProposalRefusal): Error {
  return match(refusal)
    .with({ error: 'NOT_FOUND' }, () => new MemoryProposalNotFoundError(proposalID))
    .with(
      { error: 'CLOSED' },
      (closed) => new ProposalClosedError(proposalID, memoryStatuses[closed.state]),
    )
    .with({ error: 'CONFLICT' }, () => new ProposalHashError(proposalID))
    .with(
      { error: 'NOT_ALLOWED' },
      (refused) =>
        new Error(`the shared checks refused a memory answer they always allow: ${refused.reason}`),
    )
    .exhaustive();
}

// The caller's own write fails with the caller's own error, which the shared path must not read as
// one of its refusals.
class CallerWriteError extends Error {
  override readonly name = 'CallerWriteError';

  constructor(cause: unknown) {
    super("the write of the memory answer's caller failed", { cause });
  }
}
