import type { LiveTopic } from '@heynixie/contract';
import type { Transaction } from 'kysely';
import type { Writer } from '../types';
import { requireWriterEpoch } from '../writer/require-writer-epoch';
import { createChangedEvent } from './changed-event';
import { commitEvent } from './commit-event';
import { pendingCommitHooks } from './pending-commit-hooks';
import { pendingTopics } from './pending-topics';

// the transaction that withWriteTransaction passes to its callback
export type WriteTransaction = Transaction<unknown>;

export async function withWriteTransaction<T>(
  writer: Pick<Writer, 'commits' | 'db' | 'epoch'>,
  fn: (tx: WriteTransaction) => Promise<T>,
): Promise<T> {
  let topics = new Set<LiveTopic>();

  let hooks: (() => void)[] = [];

  const result = await writer.db.transaction().execute(async (tx) => {
    topics = pendingTopics.open(tx);
    hooks = pendingCommitHooks.open(tx);

    await requireWriterEpoch(tx, writer.epoch);

    return fn(tx);
  });

  for (const hook of hooks) {
    hook();
  }

  writer.commits.dispatchEvent(new Event(commitEvent));

  if (topics.size > 0) {
    writer.commits.dispatchEvent(createChangedEvent([...topics]));
  }

  return result;
}
