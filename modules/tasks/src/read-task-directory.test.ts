import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import { createSystemTask } from './create-system-task';
import { readTaskDirectory } from './read-task-directory';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TaskMessaging } from './types';

function setupTest() {
  return startTestTasks();
}

test('it adds each started task to the directory, with the name and the brief a task of the release before holds in its creation', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'memory-writer');

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  const messaging: TaskMessaging = {
    hopLimit: 20,
    ownerName: null,
    agentName: null,
    directory: [
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks.',
        isWokenByMessages: true,
        speaker: 'conversation',
      },
    ],
  };

  const directory = await readTaskDirectory(ctx.context, messaging);

  expect(directory).toStrictEqual({
    hopLimit: 20,
    ownerName: null,
    agentName: null,
    directory: [
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks.',
        isWokenByMessages: true,
        speaker: 'conversation',
      },
      {
        taskID: 'k3x9m2p7qa',
        name: 'Garden plan',
        brief: 'Plan the beds.',
        isWokenByMessages: true,
        speaker: 'plain_task',
      },
    ],
  });
});

test.each([
  ['default', 'persona_task'],
  ['none', 'plain_task'],
] as const)(
  'it gives a task started with the persona %s the speaker %s, and its brief from the brief record',
  async (persona, speaker) => {
    const ctx = await setupTest();
    const starter = await seedConversationStep(ctx.context);

    const taskID = await seedStartedTask(ctx.context, {
      starter: starter.claim,
      name: 'Tide tables',
      brief: 'Find the high tides for Saturday.',
      options: { persona },
    });

    const directory = await readTaskDirectory<Pick<TaskMessaging, 'directory'>>(ctx.context, {
      directory: [],
    });

    expect(directory.directory).toStrictEqual([
      {
        taskID,
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
        isWokenByMessages: true,
        speaker,
      },
    ]);
  },
);

test('it names a started task by its ID once its name is forgotten', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  await removeTestRecordKey(ctx.context.log, 1);

  const directory = await readTaskDirectory<Pick<TaskMessaging, 'directory'>>(ctx.context, {
    directory: [],
  });

  expect(directory.directory).toStrictEqual([
    {
      taskID: 'k3x9m2p7qa',
      name: 'k3x9m2p7qa',
      brief: '',
      isWokenByMessages: true,
      speaker: 'plain_task',
    },
  ]);
});

test('it lists a started task whose creation record names a brief message and holds no brief text', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-1',
      payload: {
        taskID: 'tide-1',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        briefMessageID: 'b7k2m9q4xa',
      },
      erasable: { name: 'Tide tables' },
    },
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-1',
      payload: {
        messageID: 'b7k2m9q4xa',
        from: 'conversation',
        to: 'tide-1',
        kind: 'request',
        replyTo: null,
        onBehalfOf: [],
        hop: 0,
        hopLimit: 6,
        wake: true,
        woke: true,
        opensWait: false,
        source: 'task:conversation',
      },
      erasable: { body: 'Find the high tides for Saturday.' },
    },
  ]);

  const empty: Pick<TaskMessaging, 'directory'> = { directory: [] };

  const read = await readTaskDirectory(ctx.context, empty);

  expect(read.directory.map((task) => [task.taskID, task.name])).toStrictEqual([
    ['tide-1', 'Tide tables'],
  ]);
});
