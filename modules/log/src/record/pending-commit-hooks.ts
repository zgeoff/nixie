import type { Transaction } from 'kysely';

// The hooks each open write transaction has queued. A transaction that rolls back never reads its
// list, and the list goes with the transaction.
const pendingByTransaction = new WeakMap<Transaction<unknown>, (() => void)[]>();

export const pendingCommitHooks = {
  open: (tx: Transaction<unknown>): (() => void)[] => {
    const hooks: (() => void)[] = [];

    pendingByTransaction.set(tx, hooks);

    return hooks;
  },
  read: (tx: Transaction<unknown>): (() => void)[] | undefined => pendingByTransaction.get(tx),
};
