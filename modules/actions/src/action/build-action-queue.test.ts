import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import type { StepInput } from '@heynixie/tasks';
import { buildStepRunID, writeTaskControl } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildActionSeeder } from '../test-utils/build-action-seeder';
import { createTestStep } from '../test-utils/create-test-step';
import { startTestActions } from '../test-utils/start-test-actions';
import type { ActionsTables } from '../types';
import { buildActionQueue } from './build-action-queue';
import { claimAction } from './claim-action';
import { runActionAttempt } from './run-action-attempt';

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
    run: null,
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
        logThread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
      actionHash: 'hash-1',
      deadlineAt: null,
      effects: ['send'],
    });

    invariant(actionID.status === 'queued');

    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID.actionID };
  });

  const result = await step(stepInput);
  const actions = await ctx.db.selectFrom('actions').selectAll().execute();

  expect(actions).toMatchObject([
    {
      action_id: result.sessionBoundary,
      task_id: stepInput.taskID,
      step_key: stepInput.stepKey,
      action_hash: 'hash-1',
      tool: 'test.send',
      status: 'pending',
    },
  ]);
});

test('it returns the action a step queued when its rerun makes the same call', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    run: null,
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
        logThread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
      actionHash: 'hash-1',
      deadlineAt: null,
      effects: ['send'],
    });

  const step = queue.trackSteps(async () => {
    const first = await sendCall();
    const rerun = await sendCall();

    return {
      next: 'wait',
      records: [],
      acknowledged: [],
      sessionBoundary: JSON.stringify([first, rerun]),
    };
  });

  const result = await step(stepInput);
  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();

  const [first, rerun] = z.array(z.unknown()).parse(JSON.parse(String(result.sessionBoundary)));

  expect(actions).toHaveLength(1);
  expect(rerun).toStrictEqual(first);
});

test('it refuses a call on a thread where no step runs', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    run: null,
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
        logThread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
      actionHash: 'hash-1',
      deadlineAt: null,
      effects: ['send'],
    }),
  ).rejects.toThrow(`no step of ${stepInput.taskID} runs, so its call queues nothing`);
});

test('it forgets the step once it ends, so a later call queues nothing', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    run: null,
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
        logThread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
      actionHash: 'hash-1',
      deadlineAt: null,
      effects: ['send'],
    }),
  ).rejects.toThrow(`no step of ${stepInput.taskID} runs, so its call queues nothing`);
});

test('it refuses a call from a step whose claim a takeover replaced, and queues nothing', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    run: null,
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
        logThread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
      actionHash: 'hash-1',
      deadlineAt: null,
      effects: ['send'],
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
    run: null,
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
        logThread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
      actionHash: 'hash-1',
      deadlineAt: null,
      effects: ['send'],
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
    run: null,
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
        logThread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
      actionHash: 'hash-1',
      deadlineAt: null,
      effects: ['send'],
    });

    invariant(actionID.status === 'queued');

    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID.actionID };
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
    'done with a picture',
    {
      kind: 'success',
      result: { delivered: true },
      images: [{ mediaType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) }],
    },
    {
      outcome: 'done',
      result: { delivered: true },
      images: [{ mediaType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) }],
    },
  ],
  [
    'failed',
    { kind: 'refused', reason: 'no such address' },
    { outcome: 'failed', reason: 'no such address' },
  ],
  [
    'unknown',
    { kind: 'ambiguous', reason: 'the connection dropped' },
    { outcome: 'unknown', reason: 'the owner was asked whether this happened' },
  ],
] as const)(
  'it gives the outcome of an action that settled as %s',
  async (_status, response, expected) => {
    const ctx = await setupTest();
    const claim = await createTestStep(ctx.context);

    const stepInput: StepInput = {
      run: null,
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
          logThread: stepInput.taskID,
          tools: ['test.send'],
          model: { model: 'model-a', profile: 'chat-direct' },
          stepRunID: buildStepRunID(stepInput),
        },
        decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
        callSequence: 1,
        actionHash: 'hash-1',
        deadlineAt: null,
        effects: ['send'],
      });

      invariant(actionID.status === 'queued');

      return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID.actionID };
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

test('it gives a cancelled outcome for an action that a stop of its task cancelled', async () => {
  const ctx = await setupTest();
  const claim = await createTestStep(ctx.context);

  const stepInput: StepInput = {
    run: null,
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
        logThread: stepInput.taskID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
        stepRunID: buildStepRunID(stepInput),
      },
      decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
      callSequence: 1,
      actionHash: 'hash-1',
      deadlineAt: null,
      effects: ['send'],
    });

    invariant(actionID.status === 'queued');

    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: actionID.actionID };
  });

  const result = await step(stepInput);

  await writeTaskControl(ctx.context, { taskID: stepInput.taskID, control: 'stop' });

  const outcome = await queue.queue.waitForOutcome(String(result.sessionBoundary), 0);

  expect(outcome).toStrictEqual({
    outcome: 'cancelled',
    reason: 'the task was stopped before it ran',
  });
});

test.each([
  ['an action that the step runs', true],
  ['an action of the action runner', false],
] as const)('it reports %s as an open repeat that says who runs it', async (_name, runsInStep) => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const seed = buildActionSeeder({ context: ctx.context });

  const queued = runsInStep
    ? await seed.inStepAction({ step })
    : await seed.action({ step, actionHash: 'sha256:send-1' });

  const queue = buildActionQueue(ctx.context);

  const repeat = await queue.queue.readOpenRepeat({
    run: {
      runID: step.lease.workID,
      thread: step.lease.workID,
      logThread: step.lease.workID,
      tools: ['test.send'],
      model: { model: 'model-a', profile: 'chat-direct' },
    },
    tool: 'test.send',
    input: {},
    actionHash: queued.action_hash,
  });

  expect(repeat).toStrictEqual({ actionID: queued.action_id, runsInStep });
});

test('it reports an approved action that no run has settled to the transaction that would write a proposal', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const seed = buildActionSeeder({ context: ctx.context });

  const queued = await seed.action({ step, actionHash: 'sha256:send-1' });

  const queue = buildActionQueue(ctx.context);

  const open = await withWriteTransaction(ctx.context.log.writer, (tx) =>
    queue.queue.readOpenAsk(tx, {
      run: {
        runID: step.lease.workID,
        thread: step.lease.workID,
        logThread: step.lease.workID,
        tools: ['test.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
      tool: 'test.send',
      input: {},
      actionHash: queued.action_hash,
    }),
  );

  expect(open).toStrictEqual({
    kind: 'action',
    repeat: { actionID: queued.action_id, runsInStep: false },
  });
});
