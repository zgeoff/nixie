import { expect, test } from 'bun:test';
import { readTestActions } from '@heynixie/actions/test-utils';
import { readRecords } from '@heynixie/log';
import type { TasksTables } from '@heynixie/tasks';
import { buildTasksListTool, writeTaskControl } from '@heynixie/tasks';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readBinding } from '../session/read-binding';
import { startTestCoding } from '../test-utils/start-test-coding';

async function setupTest() {
  const ctx = await startTestCoding();

  return {
    ...ctx,
    readTask: (taskID: string) =>
      ctx.log.writer.db
        .$extendTables<TasksTables>()
        .selectFrom('tasks')
        .select(['state', 'started_by'])
        .where('task_id', '=', taskID)
        .executeTakeFirstOrThrow(),
    readBinding: (taskID: string) => readBinding(ctx.log.writer.db, taskID),
    readActions: () => readTestActions(ctx.log.writer),
    readMessagesTo: async (thread: string) => {
      const entries = await readRecords(ctx.log, {
        afterSequence: 0,
        thread,
        kinds: ['task_message'],
      });

      return entries.map((entry) => ({
        payload: entry.record.payload,
        erasable: entry.record.erasable,
      }));
    },
  };
}

test('it starts a coding task that queues one spawn, sends the brief as the prompt under the action key, and binds the session', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const taskID = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'The login test fails 1 time in 5 on CI. Find why and open a pull request.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await ctx.runActions();
  await ctx.runSteps();

  const [action] = await ctx.readActions();

  expect({ calls: ctx.adapter.calls, binding: await ctx.readBinding(taskID) }).toStrictEqual({
    calls: [
      {
        method: 'start',
        session: null,
        idempotencyKey: action?.actionID ?? 'missing',
        text: 'The login test fails 1 time in 5 on CI. Find why and open a pull request.',
      },
    ],
    binding: {
      taskID,
      adapter: 'atc',
      sessionID: 'cloud.3f9a1c2e.00000001',
      origin: 'started',
      state: 'running',
      wake: ['waiting', 'idle', 'blocked', 'decision', 'ended', 'gone'],
      hop: 0,
      fromCursor: '0',
      lastEventAt: null,
      unboundAt: null,
      heldAnswers: [],
    },
  });
});

test('it joins a running session by its short ID, binds it, and sends it nothing', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const listed = await ctx.callTool(claim, 'coding.sessions', {});

  const shortID = listed.outcome.status === 'ok' ? JSON.stringify(listed.outcome.result) : '';
  const session = /"id":"(?<id>[^"]+)"/u.exec(shortID)?.groups?.['id'] ?? '';

  const joined = await ctx.callTool(claim, 'coding.start', {
    name: 'Your billing refactor',
    brief: 'Watch for a question, and check the migration once the work is done.',
    session,
  });

  invariant(joined.outcome.status === 'ok');

  const taskID = z.string().parse(joined.outcome.result['taskID']);

  await ctx.runActions();
  await ctx.runSteps();

  expect({
    methods: ctx.adapter.calls.map((call) => call.method),
    actions: await ctx.readActions(),
    binding: await ctx.readBinding(taskID),
  }).toStrictEqual({
    methods: ['list', 'join'],
    actions: [],
    binding: {
      taskID,
      adapter: 'atc',
      sessionID: 'cloud.3f9a1c2e.7c1d0e55',
      origin: 'joined',
      state: 'idle',
      wake: ['waiting', 'ended', 'gone'],
      hop: 0,
      fromCursor: '0',
      lastEventAt: null,
      unboundAt: null,
      heldAnswers: [],
    },
  });

  expect(JSON.stringify(joined.outcome)).not.toContain('7c1d0e55');
});

test('it refuses a second join of a session that an open coding task binds', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const listed = await ctx.callTool(claim, 'coding.sessions', {});

  const session = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'] ?? '';
  const join = { brief: 'Watch for a question.', session };

  const taskID = await ctx.startTask(claim, { ...join, name: 'Billing' });
  const second = await ctx.callTool(claim, 'coding.start', { ...join, name: 'Billing again' });

  expect(second.outcome).toStrictEqual({
    status: 'error',
    message: `The session ${session} is already bound to the task ${taskID}.`,
  });
});

test.each([
  ['an ended session', 'ended', 'That session has ended.'],
  ['a session out of sight', 'gone', 'That session is out of reach.'],
] as const)('it refuses to join %s', async (_label, state, message) => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const listed = await ctx.callTool(claim, 'coding.sessions', {});

  const session = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'] ?? '';

  ctx.adapter.addSession({ id: 'cloud.3f9a1c2e.7c1d0e55', name: 'billing refactor', state });

  const joined = await ctx.callTool(claim, 'coding.start', {
    name: 'Billing',
    brief: 'Watch for a question.',
    session,
  });

  expect(joined.outcome).toStrictEqual({ status: 'error', message });
});

test('it refuses to join a short ID that names no session', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const joined = await ctx.callTool(claim, 'coding.start', {
    name: 'Billing',
    brief: 'Watch for a question.',
    session: 'cs4k',
  });

  expect(joined.outcome).toStrictEqual({
    status: 'error',
    message: 'No session has the ID cs4k. Call coding.sessions for the IDs.',
  });
});

test('it ends the task as done with a report when the system refuses the spawn', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.replyNext('start', { status: 'refused', canClear: false, reason: 'bad_args' });

  const taskID = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await ctx.runActions();
  await ctx.runSteps();

  const ended = await readRecords(ctx.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['task.run_ended'],
  });

  expect({
    task: await ctx.readTask(taskID),
    binding: await ctx.readBinding(taskID),
    report: ended.map((entry) => entry.record.erasable),
  }).toStrictEqual({
    task: { state: 'done', started_by: 'conversation' },
    binding: null,
    report: [
      {
        status: 'readable',
        fields: { body: 'report:\n  summary: "The coding session did not start: bad_args."' },
      },
    ],
  });
});

test('it lists the session of each coding task for tasks.list, and no meters', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const taskID = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await ctx.runActions();
  await ctx.runSteps();

  const fields = await ctx.definition.listFields?.(ctx.context, [taskID, 'nothing']);

  expect({ meters: ctx.definition.meters, fields }).toStrictEqual({
    meters: [],
    fields: new Map([
      [taskID, { session: { origin: 'started', state: 'running', lastEventAt: null } }],
    ]),
  });
});

test('it shows a task that coding.start started in tasks.list under the runner atc', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const taskID = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  const outcome = await buildTasksListTool(ctx.context, { directory: [] }).run(
    buildMockToolCall({ tool: 'tasks.list', input: { runner: 'atc' } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        expect.objectContaining({ id: taskID, name: 'Fix the flaky login test', runner: 'atc' }),
      ],
    },
  });
});

test('it cancels the spawn of a coding task that stops before the spawn runs, and starts no session', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const taskID = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });

  const attempts = await ctx.runActions();
  const actions = await ctx.readActions();

  const spawns = actions.filter((action) => action.tool === 'coding.spawn');

  expect({
    attempts,
    spawnAttempts: spawns.map((action) => action.attemptCount),
    calls: ctx.adapter.calls,
  }).toStrictEqual({ attempts: 0, spawnAttempts: [0], calls: [] });
});
