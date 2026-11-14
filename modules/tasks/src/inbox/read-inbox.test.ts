import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createConversationTask } from '../conversation/create-conversation-task';
import { writeStepCommit } from '../step/write-step-commit';
import { claimTask } from '../task/projection/claim-task';
import { writeInboxRecords } from '../task/projection/write-inbox-records';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readInbox } from './read-inbox';

function setupTest() {
  return startTestTasks();
}

test('it reads the inbox records past the read cursor, and no other record of the task', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'already read' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

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
});
