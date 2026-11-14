import type { Transaction } from 'kysely';
import { proposalsDeferredCodec } from '../records/proposals-deferred-codec';
import { pickReturnAt } from '../sweeps/pick-return-at';
import type {
  ProposalAnswerInput,
  ProposalKindHandler,
  SharedProposal,
} from './proposal-kind-handler';
import type { AnswerSettlement, ProposalCoreDeps } from './types';

interface DeferRequest {
  readonly row: SharedProposal;
  readonly handler: ProposalKindHandler;
  readonly answer: ProposalAnswerInput;
}

// A defer moves the row to deferred, sets its return time and its new lapse, and writes the record
// that the task reads.
export async function writeDefer(
  deps: ProposalCoreDeps,
  tx: Transaction<unknown>,
  request: DeferRequest,
): Promise<AnswerSettlement> {
  const row = request.row;
  const answer = request.answer;
  const deferUntil = answer.deferUntil ?? 0;

  const context = await deps.readDeferContext(tx);

  const returnAt = pickReturnAt(deferUntil, context.quietHours, context.zone);

  const lapsesAt = Math.min(
    row.deadlineAt ?? Number.POSITIVE_INFINITY,
    Math.max(row.lapsesAt, returnAt + request.handler.lapseIntervalMs),
  );

  await deps.writeThreadRecord(tx, {
    kind: proposalsDeferredCodec.kind,
    definitions: deps.definitions(),
    ...(row.thread === null ? {} : { thread: row.thread }),
    payload: proposalsDeferredCodec.encode({
      proposalID: row.id,
      shortID: row.shortID,
      generation: row.deferGeneration + 1,
      deferUntil,
      returnAt,
      lapsesAt,
    }),
    ...(answer.note === undefined ? {} : { erasable: { note: answer.note } }),
  });

  return { status: 'answered', result: { proposalID: row.id, state: 'deferred' } };
}
