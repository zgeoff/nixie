import { readRecords } from './read-records';
import type { RecordWake } from './start-record-wake';
import { startRecordWake } from './start-record-wake';
import { subscribeToCommits } from './subscribe-to-commits';
import type { Log, RecordWithChanges, SubscribeToChanges } from './types';

export interface SubscribeToRecordsOptions {
  readonly afterSequence: number;
  readonly thread?: string;
  readonly signal?: AbortSignal;

  // the writer's commit bus by default; a reader in another process passes the WAL subscription
  readonly subscribeToChanges?: SubscribeToChanges;
}

// Yields every record after a sequence, with its changed projection rows, then waits for the next
// commit and reads again. The stream ends once the signal aborts. A commit during a read makes the
// next read run at once, so no commit goes unread.
export async function* subscribeToRecords(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  options: SubscribeToRecordsOptions,
): AsyncGenerator<RecordWithChanges, void, undefined> {
  const wake = startRecordWake({
    subscribeToChanges:
      options.subscribeToChanges ?? ((onChange) => subscribeToCommits(log.writer, onChange)),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  const cursor = { after: options.afterSequence };

  try {
    while (options.signal?.aborted !== true) {
      const batch = await readNextBatch(log, wake, { ...options, afterSequence: cursor.after });

      yield* batch;
      cursor.after = batch.at(-1)?.record.sequence ?? cursor.after;

      if (batch.length < BATCH_SIZE) {
        await wake.wait();
      }
    }
  } finally {
    wake.stop();
  }
}

const BATCH_SIZE = 100;

// the reset comes before the read, so a commit that lands during the read wakes the stream again
function readNextBatch(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  wake: RecordWake,
  options: SubscribeToRecordsOptions,
): Promise<readonly RecordWithChanges[]> {
  wake.reset();

  return readRecords(log, {
    afterSequence: options.afterSequence,
    limit: BATCH_SIZE,
    ...(options.thread === undefined ? {} : { thread: options.thread }),
  });
}
