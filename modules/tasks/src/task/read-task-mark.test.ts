import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { taskMarkSetCodec } from './codec/task-mark-set-codec';
import { createTask } from './create-task';
import { readTaskMark } from './read-task-mark';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  return {
    ...tasks,
    startTask: (name: string, disposable: boolean) =>
      seedTask(tasks.context, {
        starter: starter.claim,
        name,
        brief: 'Find the high tides for Saturday.',
        disposable,
      }),
    readMark: (taskID: string) => readTaskMark(tasks.writer.db, taskID),
  };
}

test('it reads the mark that a start gave', async () => {
  const ctx = await setupTest();
  const disposableID = await ctx.startTask('Tide tables', true);
  const keptID = await ctx.startTask('Ferry times', false);
  const currentMark = await ctx.readMark(disposableID);

  expect(currentMark).toStrictEqual({ disposable: true });

  const currentMark2 = await ctx.readMark(keptID);

  expect(currentMark2).toStrictEqual({ disposable: false });
});

test('it reads null for the conversation and for a task that no start made', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'Tidy the shelves.');
  const currentMark = await ctx.readMark('conversation');

  expect(currentMark).toBeNull();

  const currentMark2 = await ctx.readMark(taskID);

  expect(currentMark2).toBeNull();
});

test('it reads null for an unknown task', async () => {
  const ctx = await setupTest();
  const currentMark = await ctx.readMark('nosuchtask');

  expect(currentMark).toBeNull();
});

test('it reads a started task whose creation record has no mark as kept', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: ctx.context.definitions(),
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan' },
    },
  ]);

  const currentMark = await ctx.readMark('k3x9m2p7qa');

  expect(currentMark).toStrictEqual({ disposable: false });
});

test('it reads the newest change of the owner over the mark of the start', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.startTask('Tide tables', true);

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.mark_set',
      definitions: ctx.context.definitions(),
      thread: taskID,
      payload: taskMarkSetCodec.encode({ taskID, disposable: false }),
    },
    {
      kind: 'task.mark_set',
      definitions: ctx.context.definitions(),
      thread: taskID,
      payload: taskMarkSetCodec.encode({ taskID, disposable: true }),
    },
    {
      kind: 'task.mark_set',
      definitions: ctx.context.definitions(),
      thread: taskID,
      payload: taskMarkSetCodec.encode({ taskID, disposable: false }),
    },
  ]);

  const currentMark = await ctx.readMark(taskID);

  expect(currentMark).toStrictEqual({ disposable: false });
});
