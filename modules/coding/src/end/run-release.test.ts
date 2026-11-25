import { expect, test } from 'bun:test';
import { readTestActions } from '@heynixie/actions/test-utils';
import { readRecords } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readBinding } from '../session/read-binding';
import { startTestCoding } from '../test-utils/start-test-coding';
import { runCodingSweep } from './run-coding-sweep';

async function setupTest() {
  const ctx = await startTestCoding();
  const claim = await ctx.claimConversation();

  const startTask = (): Promise<string> =>
    ctx.startTask(claim, {
      runner: 'atc',
      name: 'Fix the flaky login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
    });

  return {
    ...ctx,
    seed: {
      startedSession: async (): Promise<string> => {
        const taskID = await startTask();

        await ctx.runActions();
        await ctx.runSteps();

        return taskID;
      },
      joinedSession: async (): Promise<string> => {
        ctx.adapter.addSession({ id: 'cloud.3f9a1c2e.7c1d0e55', name: 'billing', state: 'idle' });

        const listed = await ctx.callTool(claim, 'coding.sessions', {});

        const shortID = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'];

        return ctx.startTask(claim, {
          runner: 'atc',
          name: 'Your billing refactor',
          brief: 'Watch for a question.',
          session: shortID ?? '',
        });
      },
      startedTask: startTask,
    },
    control: (taskID: string, control: 'stop' | 'close') =>
      writeTaskControl(ctx.context, { taskID, control }),
    sweep: () => runCodingSweep(ctx.coding, ctx.adapter),
    readUnboundAt: async (taskID: string) => {
      const binding = await readBinding(ctx.log.writer.db, taskID);

      return binding?.unboundAt ?? null;
    },
    readStops: async () => {
      const actions = await readTestActions(ctx.log.writer);

      const stops = actions.filter((action) => action.tool === 'coding.stop');

      const queued = await readRecords(ctx.log, { afterSequence: 0, kinds: ['action.queued'] });

      return stops.map((stop) => ({
        status: stop.status,
        arguments: queued.find((entry) => entry.record.payload['actionID'] === stop.actionID)
          ?.record.erasable,
      }));
    },
    readStopCalls: () => ctx.adapter.calls.filter((call) => call.method === 'stop'),
  };
}

test('it stops a started session through a coding.stop action when the task stops, and lets go of it', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedSession();

  await ctx.control(taskID, 'stop');
  await ctx.runActions();

  expect({
    stops: await ctx.readStops(),
    calls: ctx.readStopCalls(),
    unboundAt: await ctx.readUnboundAt(taskID),
  }).toStrictEqual({
    stops: [
      {
        status: 'done',
        arguments: {
          status: 'readable',
          fields: {
            arguments: { session: 'atc:cloud.3f9a1c2e.00000001', origin: 'started' },
          },
        },
      },
    ],
    calls: [
      {
        method: 'stop',
        session: 'cloud.3f9a1c2e.00000001',
        idempotencyKey: null,
        text: null,
      },
    ],
    unboundAt: expect.any(Number),
  });
});

test('it queues a coding.stop with the joined origin when a task that joined its session stops', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.joinedSession();

  await ctx.control(taskID, 'stop');

  const stops = await ctx.readStops();

  expect(stops).toStrictEqual([
    {
      status: 'pending',
      arguments: {
        status: 'readable',
        fields: { arguments: { session: 'atc:cloud.3f9a1c2e.7c1d0e55', origin: 'joined' } },
      },
    },
  ]);
});

test('it lets go of a joined session at a close, and calls no stop', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.joinedSession();

  await ctx.control(taskID, 'close');

  expect({
    stops: await ctx.readStops(),
    calls: ctx.readStopCalls(),
    unboundAt: await ctx.readUnboundAt(taskID),
  }).toStrictEqual({ stops: [], calls: [], unboundAt: expect.any(Number) });
});

test('it stops a started session at a close, then lets go of it', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedSession();

  await ctx.control(taskID, 'close');

  expect({
    calls: ctx.readStopCalls(),
    unboundAt: await ctx.readUnboundAt(taskID),
  }).toStrictEqual({
    calls: [
      {
        method: 'stop',
        session: 'cloud.3f9a1c2e.00000001',
        idempotencyKey: null,
        text: null,
      },
    ],
    unboundAt: expect.any(Number),
  });
});

test('it keeps the binding when the stop at a close fails, and the sweep lets go of it later', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedSession();

  ctx.adapter.replyNext('stop', { status: 'refused', canClear: true, reason: 'host_unavailable' });

  await ctx.control(taskID, 'close');

  const before = await ctx.readUnboundAt(taskID);

  await ctx.sweep();

  expect({
    before,
    after: await ctx.readUnboundAt(taskID),
    logged: ctx.logged,
  }).toStrictEqual({
    before: null,
    after: expect.any(Number),
    logged: [{ event: 'coding.stop_failed', fields: { taskID, reason: 'host_unavailable' } }],
  });
});

test('it binds a spawn that finished after its task stopped, then stops its session at the sweep', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedTask();

  ctx.adapter.runDuringNextStart(async () => {
    await ctx.control(taskID, 'stop');
  });

  await ctx.runActions();
  await ctx.sweep();
  await ctx.runActions();

  expect({
    calls: ctx.readStopCalls(),
    unboundAt: await ctx.readUnboundAt(taskID),
  }).toStrictEqual({
    calls: [
      {
        method: 'stop',
        session: 'cloud.3f9a1c2e.00000001',
        idempotencyKey: null,
        text: null,
      },
    ],
    unboundAt: expect.any(Number),
  });
});

test('it queues no second stop when the sweep runs after a stop that queued one', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedSession();

  await ctx.control(taskID, 'stop');
  await ctx.sweep();

  const stops = await ctx.readStops();

  expect(stops.length).toBe(1);
});

test('it runs the coding.stop of a task that stopped while its task run was at its limit', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedSession();

  await buildTaskSeeder({ context: ctx.context }).limitReached({ taskID, stepKey: 'step-1' });

  await ctx.control(taskID, 'stop');
  await ctx.runActions();

  const stops = await ctx.readStops();

  expect({
    stops: stops.map((stop) => stop.status),
    calls: ctx.readStopCalls(),
  }).toStrictEqual({
    stops: ['done'],
    calls: [
      {
        method: 'stop',
        session: 'cloud.3f9a1c2e.00000001',
        idempotencyKey: null,
        text: null,
      },
    ],
  });
});

test('it runs the coding.stop of a stopped task that closes before the queue claims the stop', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedSession();

  await ctx.control(taskID, 'stop');
  await ctx.control(taskID, 'close');
  await ctx.runActions();
  await ctx.sweep();

  const stops = await ctx.readStops();

  expect({
    stops: stops.map((stop) => stop.status),
    calls: ctx.readStopCalls(),
  }).toStrictEqual({
    stops: ['done'],
    calls: [
      {
        method: 'stop',
        session: 'cloud.3f9a1c2e.00000001',
        idempotencyKey: null,
        text: null,
      },
    ],
  });
});
