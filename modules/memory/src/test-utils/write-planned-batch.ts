import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { BatchBounds } from '../writer-types';

export interface PlannedBatch {
  // the sequences of your messages, in the order of the texts
  readonly sequences: readonly number[];
  readonly bounds: BatchBounds;
}

// Records the writer's first start at sequence 0, then your messages, then a live batch planned
// from the cursor through the last message, the way the log stands just before the batch publishes.
export async function writePlannedBatch(log: Log, texts: readonly string[]): Promise<PlannedBatch> {
  const records = await writeRecords(log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
    ...texts.map((text) => ({
      kind: 'owner_message' as const,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text },
    })),
  ]);

  const sequences = records.slice(1).map((record) => record.sequence);
  const end = sequences.at(-1);

  invariant(end !== undefined, 'a planned batch needs a message');

  await writeRecords(log, [
    {
      kind: 'memory.batch_planned',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { start: 0, end, mode: 'live', at: 1_000_000 },
    },
  ]);

  return { sequences, bounds: { start: 0, end } };
}
