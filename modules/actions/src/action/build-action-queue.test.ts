import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { buildActionHash as buildPolicyActionHash, readActionProposals } from '@heynixie/policy';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import type { StartedClaim, StepInput } from '@heynixie/tasks';
import { buildStepRunID, writeStepCommit, writeTaskControl } from '@heynixie/tasks';
import { seedDefinitionTask, seedOpenDefinitionRun } from '@heynixie/tasks/test-utils';
import { buildToolRegistry, findToolDeclaration, runToolCall } from '@heynixie/tools';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildActionSeeder } from '../test-utils/build-action-seeder';
import { buildMockLiftedCall } from '../test-utils/build-mock-lifted-call';
import { createTestStep } from '../test-utils/create-test-step';
import { seedDeclinedProposal } from '../test-utils/seed-declined-proposal';
import { startTestBudgetedActions } from '../test-utils/start-test-budgeted-actions';
import type { ActionsTables } from '../types';
import { buildActionQueue } from './build-action-queue';
import { claimAction } from './claim-action';
import { createAllowedAction } from './create-allowed-action';
import { runActionAttempt } from './run-action-attempt';

async function setupTest() {
  const actions = await startTestBudgetedActions();

  const bridge = buildActionQueue(actions.context);

  const registry = buildToolRegistry([
    buildMockToolDefinition({
      name: 'notes_wipe',
      execution: 'direct',
      declaration: { effects: ['export'] },
    }),
    buildMockToolDefinition({
      name: 'test.buy',
      execution: 'queued',
      input: { properties: { amount: { type: 'number' } }, required: ['amount'] },
      declaration: { effects: ['spend'], amount: 'amount' },
    }),
  ]);

  const options = {
    registry,
    decide: readStarterDecisionPoint((tool) => findToolDeclaration(registry, tool), {
      extraRules: [
        {
          id: 'weekly-shop',
          revision: 1,
          rule: {
            id: 'weekly-shop',
            outcome: 'allow' as const,
            tools: ['test.buy'],
            lift: { perAction: 20, budget: 'groceries' },
          },
        },
      ],
    }),
    log: actions.context.log,
    definitions: actions.context.definitions,
    queue: bridge.queue,
    queuedWaitMs: 10_000,
  };

  return {
    ...actions,
    db: actions.writer.db.$extendTables<ActionsTables>(),
    bridge,

    // a model's call of a tool in the task run that the claim holds, through the real queue
    callTool: (claim: StartedClaim, tool: string, input: JSONObject) =>
      runToolCall(
        { tool, input, toolUseID: 'toolu_1' },
        {
          runID: 'run-1',
          thread: claim.lease.workID,
          logThread: claim.lease.workID,
          tools: ['notes_wipe', 'test.buy'],
          model: { model: 'model-a', profile: 'chat-direct' },
          stepRunID: buildStepRunID(claim),
        },
        options,
      ),

    // the question that a purchase of 6 dollars asks the queue about a task's run
    buildBuyQuery: (taskID: string) => ({
      run: {
        runID: taskID,
        thread: taskID,
        logThread: taskID,
        tools: ['test.buy'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
      tool: 'test.buy',
      input: { amount: 6 },
      actionHash: buildPolicyActionHash({
        tool: 'test.buy',
        input: { amount: 6 },
        destinations: [],
        deadlineAt: null,
      }),
    }),
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

test('it reports the decline of the same action earlier in the task run to the transaction that would write a proposal', async () => {
  const ctx = await setupTest();
  const spender = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, buildMockLiftedCall(spender, 6_000_000));

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'weekly-shop',
    definitionHash: 'hash-1',
  });

  const step = await seedOpenDefinitionRun(ctx.context, {
    taskID,
    definitionID: 'weekly-shop',
    definitionHash: 'hash-1',
  });

  const asked = await createAllowedAction(ctx.context, buildMockLiftedCall(step, 6_000_000));

  invariant('shortID' in asked);

  await seedDeclinedProposal(ctx.context, asked.shortID);

  const queue = buildActionQueue(ctx.context);

  const open = await withWriteTransaction(ctx.context.log.writer, (tx) =>
    queue.queue.readOpenAsk(tx, ctx.buildBuyQuery(taskID)),
  );

  expect(open).toStrictEqual({ kind: 'declined', shortID: asked.shortID });
});

test('it reports no decline once a new run of the task has opened', async () => {
  const ctx = await setupTest();
  const spender = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, buildMockLiftedCall(spender, 6_000_000));

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'weekly-shop',
    definitionHash: 'hash-1',
  });

  const seed = { taskID, definitionID: 'weekly-shop', definitionHash: 'hash-1' };

  const first = await seedOpenDefinitionRun(ctx.context, seed);
  const asked = await createAllowedAction(ctx.context, buildMockLiftedCall(first, 6_000_000));

  invariant('shortID' in asked);

  await seedDeclinedProposal(ctx.context, asked.shortID);

  const queue = buildActionQueue(ctx.context);

  const before = await withWriteTransaction(ctx.context.log.writer, (tx) =>
    queue.queue.readOpenAsk(tx, ctx.buildBuyQuery(taskID)),
  );

  await writeStepCommit(ctx.context, first, {
    next: 'wait',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'Done.' } },
  });

  await seedOpenDefinitionRun(ctx.context, seed);

  const after = await withWriteTransaction(ctx.context.log.writer, (tx) =>
    queue.queue.readOpenAsk(tx, ctx.buildBuyQuery(taskID)),
  );

  expect([before, after]).toStrictEqual([{ kind: 'declined', shortID: asked.shortID }, null]);
});

test('it answers a retried tool call that the owner declined in this run with the earlier short ID, and writes no second proposal', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'weekly-shop',
    definitionHash: 'hash-1',
  });

  const claim = await seedOpenDefinitionRun(ctx.context, {
    taskID,
    definitionID: 'weekly-shop',
    definitionHash: 'hash-1',
  });

  const asked = await ctx.callTool(claim, 'notes_wipe', { query: 'old' });
  const [proposal] = await readActionProposals(ctx.writer.db);

  invariant(proposal, 'the call asked the owner');

  await seedDeclinedProposal(ctx.context, proposal.shortID);

  const retried = await ctx.callTool(claim, 'notes_wipe', { query: 'old' });
  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(asked.content).toStrictEqual([
    { type: 'text', text: expect.stringContaining(proposal.shortID) },
  ]);

  expect(retried).toStrictEqual({
    content: [
      {
        type: 'text',
        text: `denied: the user declined this same action earlier in this run (\`${proposal.shortID}\`), so it asks nothing more. Do not propose it again.`,
      },
    ],
    isError: true,
  });

  expect(records.filter((entry) => entry.record.kind === 'policy.action_proposed')).toHaveLength(1);
});

test('it answers a retried purchase that the owner declined in this run with the earlier short ID, and writes no second proposal', async () => {
  const ctx = await setupTest();
  const spender = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, buildMockLiftedCall(spender, 6_000_000));

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'weekly-shop',
    definitionHash: 'hash-1',
  });

  const claim = await seedOpenDefinitionRun(ctx.context, {
    taskID,
    definitionID: 'weekly-shop',
    definitionHash: 'hash-1',
  });

  const stepInput: StepInput = {
    run: null,
    taskID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };

  const replies: unknown[] = [];

  const step = ctx.bridge.trackSteps(async () => {
    const first = await ctx.callTool(claim, 'test.buy', { amount: 6 });
    const [proposal] = await readActionProposals(ctx.writer.db);

    invariant(proposal, 'the purchase over the budget asked the owner');

    await seedDeclinedProposal(ctx.context, proposal.shortID);

    const retried = await ctx.callTool(claim, 'test.buy', { amount: 6 });

    replies.push(first, retried);

    return { next: 'wait', records: [], acknowledged: [] };
  });

  await step(stepInput);

  const [proposal] = await readActionProposals(ctx.writer.db);
  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  invariant(proposal, 'the proposal stays on the log');

  expect(replies[1]).toStrictEqual({
    content: [
      {
        type: 'text',
        text: `denied: the user declined this same action earlier in this run (\`${proposal.shortID}\`), so it asks nothing more. Do not propose it again.`,
      },
    ],
    isError: true,
  });

  expect(records.filter((entry) => entry.record.kind === 'policy.action_proposed')).toHaveLength(1);
});
