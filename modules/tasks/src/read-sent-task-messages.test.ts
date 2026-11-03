import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readSentTaskMessages } from './read-sent-task-messages';
import { startTestTasks } from './test-utils/start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it reads the messages a task sent to every other task, newest first, and none it received', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.context.log,
    [
      { messageID: 'a1', from: 'planner', to: 'conversation' },
      { messageID: 'a2', from: 'conversation', to: 'planner' },
      { messageID: 'a3', from: 'planner', to: 'shopper' },
    ].map((message) => ({
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: message.to,
      payload: {
        ...message,
        kind: 'chat',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        source: `task:${message.from}`,
      },
      erasable: { body: `A note from ${message.from}.` },
    })),
  );

  const sent = await Array.fromAsync(readSentTaskMessages(ctx.context, 'planner'));

  expect(sent.map((record) => [record.sequence, record.thread])).toStrictEqual([
    [3, 'shopper'],
    [1, 'conversation'],
  ]);
});
