import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActionsTables } from '@heynixie/actions';
import { actionsProjection, claimAction, runActionAttempt } from '@heynixie/actions';
import { logProjections, startWriter } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { buildStepRunID, tasksProjections } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { buildActionQueue } from './build-action-queue';
import { createTestStep } from './test-utils/create-test-step';

// a writer with the tasks and actions projections on a test clock, and a task whose first step a
// runner claimed, as the step input a task runner passes
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-action-queue-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const context: TasksContext = {
    log: {
      writer,
      deploymentKey: await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
        'wrapKey',
        'unwrapKey',
      ]),
      projections: [...logProjections, ...tasksProjections, actionsProjection],
    },
    clock: buildTestClock(1_000_000),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };

  const step = await createTestStep(context);

  return { context, db: writer.db.$extendTables<ActionsTables>(), taskID: step.taskID, step };
}

test('it queues a call that a step makes under that step and returns its action ID', async () => {
  const ctx = await setupTest();
  const queue = buildActionQueue(ctx.context);
  const step = queue.trackSteps(async () => {
    const actionID = await queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: ctx.taskID,
        thread: ctx.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(ctx.step),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });

    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID };
  });

  const result = await step(ctx.step);

  const actions = await ctx.db.selectFrom('actions').selectAll().execute();

  expect(actions).toMatchObject([
    {
      action_id: result.sessionBoundary,
      task_id: ctx.taskID,
      step_key: ctx.step.stepKey,
      action_hash: `sha256:${new Bun.CryptoHasher('sha256').update('{"arguments":{"to":"team"},"tool":"test.send"}').digest('hex')}`,
      tool: 'test.send',
      status: 'pending',
    },
  ]);
});

test('it returns the action a step queued when its rerun makes the same call', async () => {
  const ctx = await setupTest();
  const queue = buildActionQueue(ctx.context);
  const sendCall = () =>
    queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: ctx.taskID,
        thread: ctx.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(ctx.step),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });
  const step = queue.trackSteps(async () => {
    const first = await sendCall();
    const rerun = await sendCall();

    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: `${first} ${rerun}` };
  });

  const result = await step(ctx.step);

  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();
  const [first, rerun] = String(result.sessionBoundary).split(' ');

  expect(actions).toHaveLength(1);
  expect(rerun).toBe(first);
});

test('it refuses a call on a thread where no step runs', async () => {
  const ctx = await setupTest();
  const queue = buildActionQueue(ctx.context);

  expect(
    queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: ctx.taskID,
        thread: ctx.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(ctx.step),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    }),
  ).rejects.toThrow(`no step of ${ctx.taskID} runs, so its call queues nothing`);
});

test('it forgets the step once it ends, so a later call queues nothing', async () => {
  const ctx = await setupTest();
  const queue = buildActionQueue(ctx.context);
  const step = queue.trackSteps(() =>
    Promise.resolve({ next: 'wait', records: [], acknowledged: [] }),
  );

  await step(ctx.step);

  expect(
    queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: ctx.taskID,
        thread: ctx.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(ctx.step),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    }),
  ).rejects.toThrow(`no step of ${ctx.taskID} runs, so its call queues nothing`);
});

test('it refuses a call from a step whose claim a takeover replaced, and queues nothing', async () => {
  const ctx = await setupTest();
  const queue = buildActionQueue(ctx.context);
  const takeover = {
    ...ctx.step,
    lease: { ...ctx.step.lease, generation: ctx.step.lease.generation + 1 },
  };
  const step = queue.trackSteps(async () => {
    await queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: ctx.taskID,
        thread: ctx.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(ctx.step),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });

    return { next: 'wait', records: [], acknowledged: [] };
  });

  expect(step(takeover)).rejects.toThrow(
    `the call comes from no step that holds ${ctx.taskID}'s claim, so it queues nothing`,
  );

  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();

  expect(actions).toStrictEqual([]);
});

test('it refuses a call that carries no step run ID, and queues nothing', async () => {
  const ctx = await setupTest();
  const queue = buildActionQueue(ctx.context);
  const step = queue.trackSteps(async () => {
    await queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: ctx.taskID,
        thread: ctx.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });

    return { next: 'wait', records: [], acknowledged: [] };
  });

  expect(step(ctx.step)).rejects.toThrow(
    `the call comes from no step that holds ${ctx.taskID}'s claim, so it queues nothing`,
  );

  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();

  expect(actions).toStrictEqual([]);
});

test('it gives no outcome for an action still pending when the wait ends', async () => {
  const ctx = await setupTest();
  const queue = buildActionQueue(ctx.context);
  const step = queue.trackSteps(async () => {
    const actionID = await queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: ctx.taskID,
        thread: ctx.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(ctx.step),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });

    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID };
  });
  const result = await step(ctx.step);

  const outcome = await queue.queue.waitForOutcome(String(result.sessionBoundary), 0);

  expect(outcome).toBeNull();
});

test.each([
  [
    'done',
    { kind: 'success', result: { delivered: true } },
    { outcome: 'done', result: { delivered: true } },
  ],
  [
    'failed',
    { kind: 'refused', reason: 'no such address' },
    { outcome: 'failed', reason: 'no such address' },
  ],
  [
    'unknown',
    { kind: 'ambiguous', reason: 'the connection dropped' },
    { outcome: 'unknown', reason: 'you were asked whether this happened' },
  ],
] as const)(
  'it gives the outcome of an action that settled as %s',
  async (_status, response, expected) => {
    const ctx = await setupTest();
    const queue = buildActionQueue(ctx.context);
    const step = queue.trackSteps(async () => {
      const actionID = await queue.queue.enqueue({
        call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
        run: {
          runID: ctx.taskID,
          thread: ctx.taskID,
          tools: ['test.send'],
          model: { model: 'model-a', profile: 'chat-direct' },
          stepRunID: buildStepRunID(ctx.step),
        },
        decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
        callSequence: 1,
      });

      return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID };
    });
    const result = await step(ctx.step);
    const lease = await claimAction(ctx.context, { holder: 'action-runner', leaseMs: 60_000 });

    if (lease === null) {
      throw new Error('the queued action was not claimable');
    }
    await runActionAttempt(ctx.context, lease, {
      connectors: new Map([['test.send', { run: () => Promise.resolve(response) }]]),
      leaseMs: 60_000,
    });

    const outcome = await queue.queue.waitForOutcome(String(result.sessionBoundary), 0);

    expect(outcome).toStrictEqual(expected);
  },
);
