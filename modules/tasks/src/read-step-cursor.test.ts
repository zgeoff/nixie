import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readStepCursor } from './read-step-cursor';
import { createTestClaim } from './test-utils/create-test-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeInboxRecords } from './write-inbox-records';

test('it moves the cursor over the contiguous run of acknowledged inbox records', async () => {
  const tasks = await startTestTasks();
  const claim = await createTestClaim(tasks.context, 'tidy the inbox');

  const [first, , third] = await writeInboxRecords(
    tasks.context,
    ['first', 'second', 'third'].map((text) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
      erasable: { text },
    })),
  );

  invariant(first && third);

  const cursor = await withWriteTransaction(tasks.writer, (tx) =>
    readStepCursor(tx, claim.lease.workID, [first.sequence, third.sequence]),
  );

  expect(cursor).toStrictEqual({ readCursor: first.sequence, hasUnread: true });
});

test('it leaves nothing unread once the step acknowledges every inbox record', async () => {
  const tasks = await startTestTasks();
  const claim = await createTestClaim(tasks.context, 'tidy the inbox');

  const [message] = await writeInboxRecords(tasks.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
      erasable: { text: 'one more thing' },
    },
  ]);

  invariant(message);

  const cursor = await withWriteTransaction(tasks.writer, (tx) =>
    readStepCursor(tx, claim.lease.workID, [message.sequence]),
  );

  expect(cursor).toStrictEqual({ readCursor: message.sequence, hasUnread: false });
});
