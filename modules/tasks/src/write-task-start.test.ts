import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildStepRunID } from './build-step-run-id';
import { readInbox } from './read-inbox';
import { startedTaskDefaultTools } from './started-task-default-tools';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TaskRunOptions, TasksTables } from './types';
import { writeTaskStart } from './write-task-start';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  const db = tasks.writer.db.$extendTables<TasksTables>();

  const options: TaskRunOptions = {
    model: null,
    profile: null,
    persona: 'none',
    memory: 'none',
    tools: startedTaskDefaultTools,
    report: 'wake',
    limits: { turns: 25, dollars: 2 },
  };

  return {
    ...tasks,
    start: (name: string, brief: string, context = tasks.context) =>
      writeTaskStart(context, {
        from: 'conversation',
        name,
        brief,
        options,
        hopLimit: 7,
        stepRunID: buildStepRunID(starter.claim),
      }),
    readStartRecords: async (afterSequence: number) => {
      const entries = await readRecords(tasks.context.log, {
        afterSequence,
        kinds: ['task.created', 'task_message'],
      });

      return entries.map((entry) => entry.record);
    },
    readLastSequence: async () => {
      const row = await db
        .selectFrom('records')
        .select((eb) => eb.fn.max('sequence').as('sequence'))
        .executeTakeFirstOrThrow();

      return row.sequence ?? 0;
    },
    readTasks: () =>
      db
        .selectFrom('tasks')
        .select(['task_id', 'state'])
        .where('is_conversation', '=', 0)
        .execute(),
    readMessages: () =>
      db.selectFrom('task_messages').select(['message_id', 'wait_state', 'kind']).execute(),
  };
}

test('it writes the task and its brief record in one start, with the brief unread and no wait open', async () => {
  const ctx = await setupTest();
  const before = await ctx.readLastSequence();
  const outcome = await ctx.start('Tide tables', 'Find the high tides for Saturday.');
  const records = await ctx.readStartRecords(before);

  expect(outcome).toStrictEqual({ status: 'started', taskID: expect.toBeString() });

  const [created, brief] = records;

  expect(records.map((record) => record.kind)).toStrictEqual(['task.created', 'task_message']);

  expect(created).toMatchObject({
    payload: { startedBy: 'conversation', briefMessageID: brief?.payload['messageID'] },
    erasable: { status: 'readable', fields: { name: 'Tide tables' } },
  });

  expect(brief).toMatchObject({
    sequence: (created?.sequence ?? 0) + 1,
    thread: created?.thread,
    payload: {
      from: 'conversation',
      to: created?.thread,
      kind: 'request',
      replyTo: null,
      onBehalfOf: [],
      hop: 0,
      hopLimit: 7,
      wake: true,
      woke: true,
      opensWait: false,
      source: 'task:conversation',
    },
    erasable: { status: 'readable', fields: { body: 'Find the high tides for Saturday.' } },
  });

  const tasks = await ctx.readTasks();
  const messages = await ctx.readMessages();
  const inbox = await readInbox(ctx.context, created?.thread ?? '');

  expect(tasks).toStrictEqual([{ task_id: created?.thread ?? '', state: 'ready' }]);

  expect(messages).toStrictEqual([
    { message_id: expect.toBeString(), wait_state: 'none', kind: 'request' },
  ]);

  expect(inbox.map((record) => record.sequence)).toStrictEqual([brief?.sequence ?? 0]);
});

test('it writes neither record when a rerun of the starting step starts the same name again', async () => {
  const ctx = await setupTest();
  const first = await ctx.start('Tide tables', 'Find the high tides for Saturday.');
  const after = await ctx.readLastSequence();
  const second = await ctx.start('Tide tables', 'Find the high tides for Saturday.');

  expect(second).toStrictEqual(first);

  const records = await ctx.readStartRecords(after);

  expect(records).toStrictEqual([]);
});

test('it leaves no task and no brief when the brief record fails to write', async () => {
  const ctx = await setupTest();
  const before = await ctx.readLastSequence();

  // the task's creation record reads the definitions first, and its brief record reads them next
  let reads = 0;

  const failing = {
    ...ctx.context,
    definitions: () => {
      reads += 1;

      if (reads > 1) {
        throw new Error('the definitions are gone');
      }

      return ctx.context.definitions();
    },
  };

  const started = ctx.start('Tide tables', 'Find the high tides for Saturday.', failing);

  await Promise.allSettled([started]);

  expect(started).rejects.toThrow('the definitions are gone');

  const records = await ctx.readStartRecords(before);
  const tasks = await ctx.readTasks();

  expect(records).toStrictEqual([]);
  expect(tasks).toStrictEqual([]);
});
