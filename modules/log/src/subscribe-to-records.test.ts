import { expect, mock, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { waitForCondition } from '@heynixie/testing';
import { makeWALSubscription } from './make-wal-subscription';
import { startKeyStore } from './start-key-store';
import { subscribeToRecords } from './subscribe-to-records';
import { startTestLog } from './test-utils/start-test-log';
import { withReadSnapshot } from './test-utils/with-read-snapshot';
import { writeRecords } from './write-records';

async function setupTest() {
  const started = await startTestLog();

  const abort = new AbortController();

  onTestFinished(() => {
    abort.abort();
  });

  const readerDB = startDatabase(join(started.dataDir, 'nixie.db'));

  onTestFinished(() => readerDB.destroy());

  const readerKeys = await startKeyStore(started.dataDir);

  onTestFinished(() => readerKeys.destroy());

  const reader = {
    writer: { ...started.writer, db: readerDB, keys: readerKeys, commits: new EventTarget() },
    deploymentKey: started.log.deploymentKey,
  };

  return { log: started.log, reader, readerDB, clock: started.clock, signal: abort.signal };
}

test('it yields the records after the sequence, then a new record on the next commit, without polling', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
  ]);

  const stream = subscribeToRecords(ctx.log, { afterSequence: 1, signal: ctx.signal });
  const [first, waiting] = [await stream.next(), stream.next()];

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

  expect(ctx.clock.countSleepers()).toBe(0);
});

test('it yields a new record to a reader in another process on the poll when the commit shows after the WAL settles', async () => {
  const ctx = await setupTest();

  const stream = subscribeToRecords(ctx.reader, {
    afterSequence: 0,
    subscribeToChanges: makeWALSubscription(ctx.reader.writer, { pollMs: 1000 }),
    signal: ctx.signal,
  });

  const waiting = stream.next();

  const statusWhileHidden = await withReadSnapshot(ctx.readerDB, async () => {
    await writeRecords(ctx.log, [
      { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
    ]);

    await Bun.sleep(500);

    return Bun.peek.status(waiting);
  });

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(1000);

  const next = await waiting;

  expect(statusWhileHidden).toBe('pending');
  expect(next.value?.record.sequence).toBe(1);
});

test('it finishes the stream once the signal aborts', async () => {
  const ctx = await setupTest();

  const abort = new AbortController();

  const stream = subscribeToRecords(ctx.log, { afterSequence: 0, signal: abort.signal });
  const waiting = stream.next();

  abort.abort();

  const next = await waiting;

  expect(next).toStrictEqual({ done: true, value: undefined });
});

test('it stops its subscription once the signal aborts, even when no consumer pulls again', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  const unsubscribe = mock<() => void>();

  const abort = new AbortController();

  const stream = subscribeToRecords(ctx.log, {
    afterSequence: 0,
    subscribeToChanges: () => unsubscribe,
    signal: abort.signal,
  });

  await stream.next();

  abort.abort();

  expect(unsubscribe).toHaveBeenCalledOnce();
});
