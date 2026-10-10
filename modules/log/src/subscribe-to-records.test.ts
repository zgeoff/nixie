import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { startKeyStore } from './start-key-store';
import { subscribeToRecords } from './subscribe-to-records';
import { startTestLog } from './test-utils/start-test-log';
import { writeRecords } from './write-records';

async function setupTest() {
  const started = await startTestLog();
  const abort = new AbortController();

  onTestFinished(() => {
    abort.abort();
  });

  // a reader on its own connections stands in for one in another process, which sees a commit
  // only through the WAL file or a poll
  const readerDB = startDatabase(join(started.dataDir, 'nixie.db'));

  onTestFinished(() => readerDB.destroy());

  const readerKeys = await startKeyStore(started.dataDir);

  onTestFinished(() => readerKeys.destroy());

  const reader = {
    writer: { ...started.writer, db: readerDB, keys: readerKeys },
    deploymentKey: started.log.deploymentKey,
  };

  return { log: started.log, reader, signal: abort.signal };
}

test('it yields the records after the sequence, then a new record when the WAL changes', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
  ]);

  // an hour-long poll leaves the WAL watcher as the only wake that can arrive in time
  const stream = subscribeToRecords(ctx.reader, {
    afterSequence: 1,
    pollMs: 3_600_000,
    signal: ctx.signal,
  });
  const first = await stream.next();
  const waiting = stream.next();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'are you there' },
    },
  ]);

  const second = await waiting;

  expect(first.value?.record.sequence).toBe(2);
  expect(second.value).toMatchObject({
    record: { sequence: 3, erasable: { status: 'readable', fields: { text: 'are you there' } } },
    changes: [
      {
        projection: 'threads',
        key: 'conversation',
        row: { first_sequence: 1, last_sequence: 3, record_count: 3 },
      },
    ],
  });
});

test('it wakes by polling when no WAL change arrives', async () => {
  const ctx = await setupTest();

  const stream = subscribeToRecords(ctx.reader, {
    afterSequence: 0,
    pollMs: 20,
    subscribeToChanges: () => () => {},
    signal: ctx.signal,
  });
  const waiting = stream.next();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  const next = await waiting;

  expect(next.value?.record.sequence).toBe(1);
});

test('it finishes the stream once the signal aborts', async () => {
  const ctx = await setupTest();

  const abort = new AbortController();
  const stream = subscribeToRecords(ctx.reader, {
    afterSequence: 0,
    pollMs: 3_600_000,
    signal: abort.signal,
  });
  const waiting = stream.next();

  abort.abort();

  const next = await waiting;

  expect(next).toStrictEqual({ done: true, value: undefined });
});
