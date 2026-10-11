import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { readInbox } from './read-inbox';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepCommit } from './write-step-commit';

test('it reads the inbox records past the read cursor, and no other record of the task', async () => {
  const ctx = await startTestTasks();

  await createConversationTask(ctx.context);
  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'already read' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 }).then(
    (found) => found ?? Promise.reject(new Error('the setup claim found no task')),
  );

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [2] });
  await writeRecords(ctx.context.log, [
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);
  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'not yet read' },
    },
  ]);

  const inbox = await readInbox(ctx.context, 'conversation');

  expect(inbox).toMatchObject([
    {
      kind: 'owner_message',
      sequence: 6,
      erasable: { status: 'readable', fields: { text: 'not yet read' } },
    },
  ]);
  expect(inbox).toHaveLength(1);
});
