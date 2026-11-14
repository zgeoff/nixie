import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createConversationTask } from '../conversation/create-conversation-task';
import { claimTask } from '../task/projection/claim-task';
import { writeInboxRecords } from '../task/projection/write-inbox-records';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { startStepControlWatch } from './start-step-control-watch';

test('it ends the step with the failure when its watch cannot read the log', async () => {
  const ctx = await startTestTasks();

  await createConversationTask(ctx.context);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  await ctx.writer.stop();

  const watch = startStepControlWatch(ctx.context, claim);

  await waitForCondition(() => watch.ended.aborted);

  await watch.stop();

  expect(watch.ended.reason).toMatchObject({
    message: "the watch for the user's controls of step conversation:1 failed",
    cause: expect.any(Error),
  });
});
