import { readRecords } from './read-records';
import type { RecordWake, RecordWakeOptions } from './start-record-wake';
import { startRecordWake } from './start-record-wake';
import type { Log, RecordWithChanges } from './types';

export interface SubscribeToRecordsOptions extends RecordWakeOptions {
  readonly afterSequence: number;
  readonly thread?: string;
}

// Yields every record after a sequence, with its changed projection rows, then waits for the next
// wake and reads again. The stream ends once the signal aborts. A wake during a read makes the next
// read run at once, so no commit goes unread.
export async function* subscribeToRecords(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  options: SubscribeToRecordsOptions,
): AsyncGenerator<RecordWithChanges, void, undefined> {
  const wake = startRecordWake(log.writer.dataDir, options);
  const cursor = { after: options.afterSequence };

  try {
    while (options.signal?.aborted !== true) {
      // oxlint-disable-next-line no-await-in-loop -- each read starts after the last record yielded
      const batch = await readNextBatch(log, wake, { ...options, afterSequence: cursor.after });

      yield* batch;
      cursor.after = batch.at(-1)?.record.sequence ?? cursor.after;
      if (batch.length < BATCH_SIZE) {
        // oxlint-disable-next-line no-await-in-loop -- the stream sleeps until the next wake
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
