import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposeDeps } from '../answer/types';
import { proposalsProposerLeftCodec } from '../records/proposals-proposer-left-codec';
import { readLeftThreads } from '../rows/read-left-threads';
import type { Withdrawal } from './withdraw-in-transaction';
import { withdrawInTransaction } from './withdraw-in-transaction';

export interface StakeWithdrawal {
  readonly row: SharedProposal;
  readonly caller: string;

  // the threads of the writes that merged into the proposal, besides the row's own thread
  readonly mergedThreads: readonly string[];
}

export type StakeWithdrawalResult = Withdrawal | { readonly status: 'not_proposer' };

// Takes one proposer's stake back. The card stays open while another proposer remains, and the
// proposal settles as withdrawn when the last one leaves.
export async function withdrawStakeInTransaction(
  deps: ProposeDeps,
  tx: Transaction<unknown>,
  request: StakeWithdrawal,
): Promise<StakeWithdrawalResult> {
  const row = request.row;

  if (row.state !== 'pending' && row.state !== 'deferred') {
    return { status: 'not_open' };
  }

  const leftThreads = await readLeftThreads(tx, row.id);

  const left = new Set(leftThreads);

  const stakes = new Set(
    [row.thread, ...request.mergedThreads].filter(
      (thread): thread is string => thread !== null && !left.has(thread),
    ),
  );

  if (!stakes.has(request.caller)) {
    return { status: 'not_proposer' };
  }

  if (stakes.size > 1) {
    await writeRecordsInTransaction(tx, deps.log, [
      {
        kind: proposalsProposerLeftCodec.kind,
        definitions: deps.definitions(),
        thread: request.caller,
        payload: proposalsProposerLeftCodec.encode({ proposalID: row.id }),
      },
    ]);

    return { status: 'withdrawn' };
  }

  return withdrawInTransaction(deps, tx, row.id, { byProposer: true });
}
