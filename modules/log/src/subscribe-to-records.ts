import { readRecords } from './read-records';
import type { RecordWake } from './start-record-wake';
import { startRecordWake } from './start-record-wake';
import { subscribeToCommits } from './subscribe-to-commits';
import type { Log, RecordWithChanges, SubscribeToChanges } from './types';

export interface SubscribeToRecordsOptions {
  readonly afterSequence: number;
  readonly thread?: string;
  readonly signal?: AbortSignal;

  readonly subscribeToChanges?: SubscribeToChanges;
}

const BATCH_SIZE = 100;

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
