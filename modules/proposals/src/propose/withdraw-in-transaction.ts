import type { Transaction } from 'kysely';
import type { ProposeDeps } from '../answer/types';
import { readProposal } from '../rows/read-proposal';
import { buildApplyRun } from './build-apply-run';

export interface WithdrawOptions {
  // true when the proposer's own call withdrew it, so the note to the proposer leaves it out
  readonly byProposer: boolean;
}

export type Withdrawal =
  | { readonly status: 'withdrawn' }
  | { readonly status: 'not_open' }
  | { readonly status: 'refused' };

// Settles an open proposal as withdrawn, through its family's discard, in the caller's transaction.
export async function withdrawInTransaction(
  deps: ProposeDeps,
  tx: Transaction<unknown>,
  proposalID: string,
  options: WithdrawOptions,
): Promise<Withdrawal> {
  const row = await readProposal(tx, proposalID);

  if (row === null || (row.state !== 'pending' && row.state !== 'deferred')) {
    return { status: 'not_open' };
  }

  const handler = deps.handlers.get(row.family);

  if (handler === undefined) {
    return { status: 'refused' };
  }

  const run = buildApplyRun(
    deps,
    { row, outcome: 'withdrawn', answer: null, byProposer: options.byProposer },
    { tx, guard: () => Promise.resolve() },
  );

  const discarded = await handler.discard(run, row, 'withdrawn', null);

  if (discarded.status === 'refused') {
    return { status: 'refused' };
  }

  await run.settle(tx, discarded);

  return { status: 'withdrawn' };
}
