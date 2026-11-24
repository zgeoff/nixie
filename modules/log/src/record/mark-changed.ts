import type { LiveTopic } from '@heynixie/contract';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { pendingTopics } from './pending-topics';

// Names the topics a write with no record changed. They join the commit of the transaction that
// withWriteTransaction opened, and a rollback drops them.
export function markChanged(tx: Transaction<unknown>, topics: readonly LiveTopic[]): void {
  const pending = pendingTopics.read(tx);

  invariant(pending, 'markChanged needs the transaction that withWriteTransaction opened');

  for (const topic of topics) {
    pending.add(topic);
  }
}
