import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import { createTask } from './create-task';
import { readTaskBrief } from './read-task-brief';
import { readTaskBriefs } from './read-task-briefs';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  return {
    ...tasks,
    seedTask: (name: string, brief: string) =>
      seedStartedTask(tasks.context, { starter: starter.claim, name, brief }),
    readBriefRecord: async () => {
      const [entry] = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task_message'],
        order: 'newest',
        limit: 1,
      });

      return entry?.record;
    },
    writeCreatedTask: (taskID: string) =>
      writeRecords(tasks.context.log, [
        {
          kind: 'task.created',
          definitions: tasks.context.definitions(),
          thread: taskID,
          payload: { taskID, isConversation: false, state: 'ready', startedBy: 'conversation' },
          erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
        },
      ]),
  };
}

test('it reads the brief of a started task from its brief record', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seedTask('Tide tables', 'Find the high tides for Saturday.');
  const record = await ctx.readBriefRecord();
  const brief = await readTaskBrief(ctx.context, taskID);

  expect(brief).toStrictEqual({
    origin: 'message',
    messageID: expect.toBeString(),
    from: 'conversation',
    sequence: record?.sequence ?? 0,
    sentAt: record?.recordedAt ?? new Date(0),
    body: 'Find the high tides for Saturday.',
  });
});

test('it reads the body of a brief as null once a forget removes its key', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seedTask('Tide tables', 'Find the high tides for Saturday.');
  const record = await ctx.readBriefRecord();

  await removeTestRecordKey(ctx.context.log, record?.sequence ?? 0);

  const brief = await readTaskBrief(ctx.context, taskID);

  expect(brief).toMatchObject({
    origin: 'message',
    sequence: record?.sequence,
    body: null,
  });
});

test('it reads the brief that a task of the release before holds in its creation record, with the task ID as its own', async () => {
  const ctx = await setupTest();
  const [created] = await ctx.writeCreatedTask('k3x9m2p7qa');
  const brief = await readTaskBrief(ctx.context, 'k3x9m2p7qa');

  expect(brief).toStrictEqual({
    origin: 'created',
    taskID: 'k3x9m2p7qa',
    from: 'conversation',
    sequence: created?.sequence ?? 0,
    sentAt: created?.recordedAt ?? new Date(0),
    body: 'Plan the beds.',
  });
});

test('it reads the body of a brief in a creation record as null once its key is removed', async () => {
  const ctx = await setupTest();
  const [created] = await ctx.writeCreatedTask('k3x9m2p7qa');

  await removeTestRecordKey(ctx.context.log, created?.sequence ?? 0);

  const brief = await readTaskBrief(ctx.context, 'k3x9m2p7qa');

  expect(brief).toMatchObject({
    origin: 'created',
    body: null,
  });
});

test('it reads no brief for the conversation, and none for a task that no task started', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'Count the tiles.');
  const conversationBrief = await readTaskBrief(ctx.context, 'conversation');
  const briefless = await readTaskBrief(ctx.context, taskID);

  expect(conversationBrief).toBeNull();
  expect(briefless).toBeNull();
});

test('it reads no brief that a later record wrote than the one asked about', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seedTask('Tide tables', 'Find the high tides for Saturday.');
  const record = await ctx.readBriefRecord();
  const atBrief = await readTaskBrief(ctx.context, taskID, record?.sequence);
  const afterBrief = await readTaskBrief(ctx.context, taskID, (record?.sequence ?? 0) + 1);

  expect(atBrief).toBeNull();
  expect(afterBrief).not.toBeNull();
});

test('it reads the briefs of several tasks at once, leaving out a task with none', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedTask('Tide tables', 'Find the high tides for Saturday.');
  const second = await ctx.seedTask('Moon phases', 'List the moon phases for May.');
  const briefs = await readTaskBriefs(ctx.context, [first, second, 'conversation']);

  expect([...briefs.keys()]).toIncludeSameMembers([first, second]);

  expect([...briefs.values()].map((brief) => brief.body)).toIncludeSameMembers([
    'Find the high tides for Saturday.',
    'List the moon phases for May.',
  ]);
});
