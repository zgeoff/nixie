import { expect, test } from 'bun:test';
import type { StepInput } from '@heynixie/tasks';
import { buildStepRunID } from '@heynixie/tasks';
import { buildActionQueue } from './build-action-queue';
import { claimAction } from './claim-action';
import { runActionAttempt } from './run-action-attempt';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

async function setupTest() {
  const actions = await startTestActions();

  return {
    context: actions.context,
    db: actions.writer.db.$extendTables<ActionsTables>(),
  };
}

test('it queues a call that a step makes under that step and returns its action ID', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };

  const queue = buildActionQueue(ctx.context);

  const step = queue.trackSteps(async () => {
    const actionID = await queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: stepInput.taskID,
        thread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });

    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID };
  });

  const result = await step(stepInput);
  const actions = await ctx.db.selectFrom('actions').selectAll().execute();

  expect(actions).toMatchObject([
    {
      action_id: result.sessionBoundary,
      task_id: stepInput.taskID,
      step_key: stepInput.stepKey,
      action_hash: `sha256:${new Bun.CryptoHasher('sha256').update('{"arguments":{"to":"team"},"tool":"test.send"}').digest('hex')}`,
      tool: 'test.send',
      status: 'pending',
    },
  ]);
});

test('it returns the action a step queued when its rerun makes the same call', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };

  const queue = buildActionQueue(ctx.context);

  const sendCall = () =>
    queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: stepInput.taskID,
        thread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });

  const step = queue.trackSteps(async () => {
    const first = await sendCall();
    const rerun = await sendCall();

    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: `${first} ${rerun}` };
  });

  const result = await step(stepInput);
  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();

  const [first, rerun] = String(result.sessionBoundary).split(' ');

  expect(actions).toHaveLength(1);
  expect(rerun).toBe(first);
});

test('it refuses a call on a thread where no step runs', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };

  const queue = buildActionQueue(ctx.context);

  expect(
    queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: stepInput.taskID,
        thread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    }),
  ).rejects.toThrow(`no step of ${stepInput.taskID} runs, so its call queues nothing`);
});

test('it forgets the step once it ends, so a later call queues nothing', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };

  const queue = buildActionQueue(ctx.context);

  const step = queue.trackSteps(() =>
    Promise.resolve({ next: 'wait', records: [], acknowledged: [] }),
  );

  await step(stepInput);

  expect(
    queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: stepInput.taskID,
        thread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    }),
  ).rejects.toThrow(`no step of ${stepInput.taskID} runs, so its call queues nothing`);
});

test('it refuses a call from a step whose claim a takeover replaced, and queues nothing', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };

  const queue = buildActionQueue(ctx.context);

  const takeover = {
    ...stepInput,
    lease: { ...stepInput.lease, generation: stepInput.lease.generation + 1 },
  };

  const step = queue.trackSteps(async () => {
    await queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: stepInput.taskID,
        thread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });

    return { next: 'wait', records: [], acknowledged: [] };
  });

  expect(step(takeover)).rejects.toThrow(
    `the call comes from no step that holds ${stepInput.taskID}'s claim, so it queues nothing`,
  );

  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();

  expect(actions).toStrictEqual([]);
});

test('it refuses a call that carries no step run ID, and queues nothing', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };

  const queue = buildActionQueue(ctx.context);

  const step = queue.trackSteps(async () => {
    await queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: stepInput.taskID,
        thread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });

    return { next: 'wait', records: [], acknowledged: [] };
  });

  expect(step(stepInput)).rejects.toThrow(
    `the call comes from no step that holds ${stepInput.taskID}'s claim, so it queues nothing`,
  );

  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();

  expect(actions).toStrictEqual([]);
});

test('it gives no outcome for an action still pending when the wait ends', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };

  const queue = buildActionQueue(ctx.context);

  const step = queue.trackSteps(async () => {
    const actionID = await queue.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
      run: {
        runID: stepInput.taskID,
        thread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
    });

    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID };
  });

  const result = await step(stepInput);
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
    const claim = await createTestStep(ctx.context);

    const stepInput: StepInput = {
      taskID: claim.lease.workID,
      stepKey: claim.stepKey,
      lease: claim.lease,
      inbox: [],
      wake: claim.wake,
      sessionBoundary: null,
      signal: new AbortController().signal,
      interrupt: new AbortController().signal,
    };

    const queue = buildActionQueue(ctx.context);

    const step = queue.trackSteps(async () => {
      const actionID = await queue.queue.enqueue({
        call: { callID: 'call-1', tool: 'test.send', input: { to: 'team' }, toolUseID: null },
        run: {
          runID: stepInput.taskID,
          thread: stepInput.taskID,
          tools: ['test.send'],
          model: { model: 'model-a', profile: 'chat-direct' },
          stepRunID: buildStepRunID(stepInput),
        },
        decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
        callSequence: 1,
      });

      return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID };
    });

    const result = await step(stepInput);
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
