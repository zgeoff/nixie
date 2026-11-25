import { expect, test } from 'bun:test';
import { readRecords, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readInbox } from '../../inbox/read-inbox';
import { taskRunOptionsSchema } from '../../limit/task-run-options-schema';
import type { RunnerAction } from '../../runner/types';
import { buildStepRunID } from '../../step/build-step-run-id';
import { seedConversationStep } from '../../test-utils/seed-conversation-step';
import { startTestTasks } from '../../test-utils/start-test-tasks';
import type { QueueRunnerActionsRequest, TasksTables } from '../../types';
import { startedTaskDefaultTools } from '../started-task-default-tools';
import type { TaskStartRequest } from './write-task-start';
import { writeTaskStart } from './write-task-start';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  const db = tasks.writer.db.$extendTables<TasksTables>();

  const options = taskRunOptionsSchema.parse({
    model: null,
    profile: null,
    persona: 'none',
    memory: 'none',
    tools: startedTaskDefaultTools,
    report: 'wake',
    limits: { turns: 25, dollars: 2 },
  });

  return {
    ...tasks,
    start: (name: string, brief: string, context = tasks.context) =>
      writeTaskStart(context, {
        from: 'conversation',
        name,
        brief,
        runner: 'sandbox',
        stored: { kind: 'built', options },
        hopLimit: 7,
        stepRunID: buildStepRunID(starter.claim),
        disposable: false,
      }),
    startPlanned: (
      plan: Pick<TaskStartRequest, 'actions' | 'transaction'>,
      context: Parameters<typeof writeTaskStart>[0],
    ) =>
      writeTaskStart(context, {
        from: 'conversation',
        name: 'Garden planner',
        brief: 'Add a frost warning to the planner.',
        runner: 'sandbox',
        stored: { kind: 'built', options },
        hopLimit: 7,
        stepRunID: buildStepRunID(starter.claim),
        disposable: false,
        ...plan,
      }),
    stepKey: starter.claim.stepKey,
    readMarks: async () => {
      const entries = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task.mark_set'],
      });

      return entries.map((entry) => ({
        thread: entry.record.thread,
        payload: entry.record.payload,
      }));
    },
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
    payload: {
      startedBy: 'conversation',
      briefMessageID: brief?.payload['messageID'],
      disposable: false,
    },
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

test('it queues the actions of a start on the new task thread under the starting step key', async () => {
  const ctx = await setupTest();

  const queued: QueueRunnerActionsRequest[] = [];

  const action: RunnerAction = {
    tool: 'coding.start',
    args: { repo: 'garden-planner' },
    hashParts: ['garden-planner'],
    causedBy: { kind: 'tool_call', callID: 'call-1' },
  };

  const outcome = await ctx.startPlanned(
    { actions: [action] },
    {
      ...ctx.context,
      queueRunnerActions: (_tx, request) => {
        queued.push(request);

        return Promise.resolve(['action-1']);
      },
    },
  );

  invariant(outcome.status === 'started', 'the planned start is valid');

  expect(queued).toStrictEqual([
    { taskID: outcome.taskID, stepKey: ctx.stepKey, actions: [action] },
  ]);
});

test('it queues the actions of a start once when a rerun of the starting step starts it again', async () => {
  const ctx = await setupTest();

  const queued: QueueRunnerActionsRequest[] = [];

  const context = {
    ...ctx.context,
    queueRunnerActions: (_tx: unknown, request: QueueRunnerActionsRequest) => {
      queued.push(request);

      return Promise.resolve(['action-1']);
    },
  };

  const plan = {
    actions: [
      {
        tool: 'coding.start',
        args: { repo: 'garden-planner' },
        hashParts: ['garden-planner'],
        causedBy: { kind: 'tool_call' as const, callID: 'call-1' },
      },
    ],
  };

  await ctx.startPlanned(plan, context);
  await ctx.startPlanned(plan, context);

  expect(queued).toHaveLength(1);
});

test('it refuses a start with the sentence of the runner check, and writes no task', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.startPlanned(
    {
      transaction: {
        check: () => Promise.resolve('Another open task already runs that session.'),
        write: () => Promise.resolve(),
      },
    },
    ctx.context,
  );

  const tasks = await ctx.readTasks();

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: {
      reason: 'runner_refused',
      sentence: 'Another open task already runs that session.',
    },
  });

  expect(tasks).toStrictEqual([]);
});

test('it runs the runner write of a start with the new task ID, in the start transaction', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.startPlanned(
    {
      transaction: {
        check: () => Promise.resolve(null),
        write: async (tx, taskID) => {
          await writeRecordsInTransaction(tx, ctx.context.log, [
            {
              kind: 'task.mark_set',
              definitions: ctx.context.definitions(),
              thread: taskID,
              payload: { taskID, disposable: true },
            },
          ]);
        },
      },
    },
    ctx.context,
  );

  invariant(outcome.status === 'started', 'the planned start is valid');

  const marks = await ctx.readMarks();

  expect(marks).toStrictEqual([
    { thread: outcome.taskID, payload: { taskID: outcome.taskID, disposable: true } },
  ]);
});

test('it leaves no task when the runner write of a start fails', async () => {
  const ctx = await setupTest();

  const started = ctx.startPlanned(
    {
      transaction: {
        check: () => Promise.resolve(null),
        write: () => Promise.reject(new Error('the session is already bound')),
      },
    },
    ctx.context,
  );

  await Promise.allSettled([started]);

  const tasks = await ctx.readTasks();

  expect(started).rejects.toThrow('the session is already bound');
  expect(tasks).toStrictEqual([]);
});
