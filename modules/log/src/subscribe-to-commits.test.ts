import { expect, mock, test } from 'bun:test';
import { subscribeToCommits } from './subscribe-to-commits';
import { startTestLog } from './test-utils/start-test-log';
import { writeRecords } from './write-records';

test('it calls back once for each write transaction the writer commits', async () => {
  const started = await startTestLog();

  const onCommit = mock<() => void>();

  subscribeToCommits(started.writer, onCommit);

  await writeRecords(started.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  await writeRecords(started.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  expect(onCommit).toHaveBeenCalledTimes(2);
});

test('it stops calling back once unsubscribed', async () => {
  const started = await startTestLog();

  const onCommit = mock<() => void>();

  subscribeToCommits(started.writer, onCommit)();

  await writeRecords(started.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  expect(onCommit).not.toHaveBeenCalled();
});
