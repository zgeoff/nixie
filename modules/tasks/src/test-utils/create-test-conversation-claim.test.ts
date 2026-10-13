import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createTestConversationClaim } from './create-test-conversation-claim';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it claims the conversation step for runner-a under a 60 s lease', async () => {
  const ctx = await setupTest();

  const claim = await createTestConversationClaim(ctx.context, 'what is on today?');

  expect(claim).toStrictEqual({
    lease: {
      kind: 'task',
      workID: 'conversation',
      holder: 'runner-a',
      generation: 1,
      epoch: ctx.writer.epoch,
      expiresAt: 1_060_000,
    },
    stepKey: 'conversation:1',
  });
});

test('it sends the conversation your message with the text it is given', async () => {
  const ctx = await setupTest();

  await createTestConversationClaim(ctx.context, 'what is on today?');

  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(entries.map((entry) => entry.record)).toIncludeAllPartialMembers([
    {
      kind: 'owner_message',
      thread: 'conversation',
      erasable: { status: 'readable', fields: { text: 'what is on today?' } },
    },
  ]);
});
