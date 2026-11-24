import type { LiveTopic } from '@heynixie/contract';
import type { Transaction } from 'kysely';

// The topics each open write transaction has marked. A transaction that rolls back never reads its
// set, and the set goes with the transaction.
const pendingByTransaction = new WeakMap<Transaction<unknown>, Set<LiveTopic>>();

export const pendingTopics = {
  open: (tx: Transaction<unknown>): Set<LiveTopic> => {
    const topics = new Set<LiveTopic>();

    pendingByTransaction.set(tx, topics);

    return topics;
  },
  read: (tx: Transaction<unknown>): Set<LiveTopic> | undefined => pendingByTransaction.get(tx),
};
