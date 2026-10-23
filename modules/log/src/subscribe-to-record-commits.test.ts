import { expect, mock, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { subscribeToRecordCommits } from './subscribe-to-record-commits';
import { startTestLog } from './test-utils/start-test-log';
import { withWriteTransaction } from './with-write-transaction';
import { writeRecords } from './write-records';
import { writeRecordsInTransaction } from './write-records-in-transaction';

test('it calls back for a commit that wrote a record', async () => {
  const started = await startTestLog();

  const onRecords = mock<() => void>();

  subscribeToRecordCommits(started.writer, onRecords);

  await writeRecords(started.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:bb22' } },
  ]);

  await waitForCondition(() => onRecords.mock.calls.length === 1);

  expect(onRecords).toHaveBeenCalledOnce();
});

test('it calls back nothing for a commit that wrote no record', async () => {
  const started = await startTestLog();

  const onRecords = mock<() => void>();

  subscribeToRecordCommits(started.writer, onRecords);

  await withWriteTransaction(started.writer, () => Promise.resolve());
  await withWriteTransaction(started.writer, () => Promise.resolve());

  await writeRecords(started.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:bb22' } },
  ]);

  await waitForCondition(() => onRecords.mock.calls.length > 0);

  expect(onRecords).toHaveBeenCalledOnce();
});

test('it calls back for a record that commits while it reads its first head', async () => {
  const started = await startTestLog();

  const onRecords = mock<() => void>();
  const held = Promise.withResolvers<void>();
  const wrote = Promise.withResolvers<void>();

  const writing = withWriteTransaction(started.writer, async (tx) => {
    await writeRecordsInTransaction(tx, started.log, [
      { kind: 'owner_message', definitions: { snapshotHash: 'sha256:bb22' } },
    ]);

    wrote.resolve();

    await held.promise;
  });

  await wrote.promise;

  subscribeToRecordCommits(started.writer, onRecords);

  held.resolve();

  await writing;
  await waitForCondition(() => onRecords.mock.calls.length > 0);

  expect(onRecords).toHaveBeenCalledOnce();
});

test('it stops calling back once unsubscribed', async () => {
  const started = await startTestLog();

  const onRecords = mock<() => void>();

  subscribeToRecordCommits(started.writer, onRecords)();

  await writeRecords(started.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:bb22' } },
  ]);

  expect(onRecords).not.toHaveBeenCalled();
});
