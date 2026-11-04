import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { probeWakingInputSince } from './probe-waking-input-since';
import { createTestClaim } from './test-utils/create-test-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeInboxRecords } from './write-inbox-records';

test('it finds a waking record that arrived after the sequence', async () => {
  const tasks = await startTestTasks();
  const claim = await createTestClaim(tasks.context, 'water the ferns');

  await writeInboxRecords(tasks.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
      erasable: { text: 'the big one too' },
    },
  ]);

  const hasWake = await withWriteTransaction(tasks.writer, (tx) =>
    probeWakingInputSince(tx, claim.lease.workID, claim.startSequence),
  );

  expect(hasWake).toBeTrue();
});

test('it finds nothing when only a message that did not wake the task arrived after the sequence', async () => {
  const tasks = await startTestTasks();
  const claim = await createTestClaim(tasks.context, 'water the ferns');

  await writeInboxRecords(tasks.context, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
      payload: {
        messageID: 'p7rw2c9tln',
        from: 'conversation',
        to: claim.lease.workID,
        kind: 'chat',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: false,
        source: 'task:conversation',
      },
      erasable: { body: 'read this on your next run' },
    },
  ]);

  const hasWake = await withWriteTransaction(tasks.writer, (tx) =>
    probeWakingInputSince(tx, claim.lease.workID, claim.startSequence),
  );

  expect(hasWake).toBeFalse();
});

test('it finds nothing when the waking record arrived before the sequence', async () => {
  const tasks = await startTestTasks();
  const claim = await createTestClaim(tasks.context, 'water the ferns');

  const hasWake = await withWriteTransaction(tasks.writer, (tx) =>
    probeWakingInputSince(tx, claim.lease.workID, claim.startSequence),
  );

  expect(hasWake).toBeFalse();
});
