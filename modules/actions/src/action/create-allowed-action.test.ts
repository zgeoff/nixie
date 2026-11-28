import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { readBudgetLedger } from '@heynixie/budgets';
import { readRecords } from '@heynixie/log';
import type { FaultPointID } from '@heynixie/tasks';
import {
  LeaseLostError,
  claimTask,
  setFaultPointHandler,
  writeStepCommit,
  writeTaskControl,
} from '@heynixie/tasks';
import { seedDefinitionTask, seedOpenDefinitionRun } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { buildMockLiftedCall } from '../test-utils/build-mock-lifted-call';
import { buildStubConnector } from '../test-utils/build-stub-connector';
import { claimTestAction } from '../test-utils/claim-test-action';
import { createTestStep } from '../test-utils/create-test-step';
import { queueTestAction } from '../test-utils/queue-test-action';
import { seedDeclinedProposal } from '../test-utils/seed-declined-proposal';
import { startTestBudgetedActions } from '../test-utils/start-test-budgeted-actions';
import type { ActionsTables } from '../types';
import { buildActionHash } from './build-action-hash';
import { createAllowedAction } from './create-allowed-action';
import { runActionAttempt } from './run-action-attempt';

async function setupTest() {
  const actions = await startTestBudgetedActions();

  return {
    ...actions,
    db: actions.writer.db.$extendTables<ActionsTables>(),
    readLedger: () => readBudgetLedger(actions.writer.db, actions.budgets, 'groceries'),
  };
}

test('it queues an allowed call as a pending action due at once', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  expect(queued).toStrictEqual({ actionID: action.action_id, status: 'pending', isRepeat: false });

  expect(action).toMatchObject({
    task_id: step.lease.workID,
    step_key: `${step.lease.workID}:1`,
    action_hash: 'sha256:send-1',
    tool: 'test.send',
    status: 'pending',
    attempt_count: 0,
    attempt_open: 0,
    next_attempt_at: 1_000_000,
  });
});

test('it records the decision and keeps the arguments in the erasable fields', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: 2 });

  expect(entries.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'action.queued',
      thread: step.lease.workID,
      decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
      erasable: {
        status: 'readable',
        fields: { arguments: { to: 'team', body: 'the weekly summary' } },
      },
    },
  ]);
});

test('it refuses a call the decision point did not allow', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const create = queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'ask', stage: 9, rule: null },
  });

  await create.catch(() => {});

  expect(create).rejects.toThrowWithMessage(
    Error,
    'a call the decision point answered ask queues nothing',
  );
});

test('it returns the earlier action for a repeat call under the same step key', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const first = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db.updateTable('actions').set({ status: 'done' }).execute();

  const repeat = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  expect(repeat).toStrictEqual({ actionID: first.actionID, status: 'done', isRepeat: true });
});

test('it returns the earlier action for a repeat call while that action is pending', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const first = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const repeat = await queueTestAction(ctx.context, {
    step: { ...step, stepKey: `${step.lease.workID}:2` },
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  expect(repeat).toStrictEqual({ actionID: first.actionID, status: 'pending', isRepeat: true });
});

test('it returns the earlier action for a repeat call while that action is unknown', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const first = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db.updateTable('actions').set({ status: 'unknown' }).execute();

  const repeat = await queueTestAction(ctx.context, {
    step: { ...step, stepKey: `${step.lease.workID}:2` },
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  expect(repeat).toStrictEqual({ actionID: first.actionID, status: 'unknown', isRepeat: true });
});

test('it queues a new action when the same call settled under an earlier step', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const first = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db.updateTable('actions').set({ status: 'done' }).execute();

  const next = await queueTestAction(ctx.context, {
    step: { ...step, stepKey: `${step.lease.workID}:2` },
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  expect(next.isRepeat).toBeFalse();
  expect(next.actionID).not.toBe(first.actionID);
});

test('it returns the cancelled action to the rerun of the step that a stop ended', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const first = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });
  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'restart' });

  const rerun = await claimTask(ctx.context, { holder: 'step-runner', leaseMs: 60_000 });

  invariant(rerun);

  const next = await queueTestAction(ctx.context, {
    step: rerun,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  expect(rerun.stepKey).toBe(step.stepKey);
  expect(next).toStrictEqual({ actionID: first.actionID, status: 'pending', isRepeat: true });
});

test('it queues a new action for the same call in a later step than the one a stop ended', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const first = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });
  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'restart' });

  const rerun = await claimTask(ctx.context, { holder: 'step-runner', leaseMs: 60_000 });

  invariant(rerun);

  await writeStepCommit(ctx.context, rerun, { next: 'continue', records: [], acknowledged: [] });

  const later = await claimTask(ctx.context, { holder: 'step-runner', leaseMs: 60_000 });

  invariant(later);

  const next = await queueTestAction(ctx.context, {
    step: later,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  expect(next.isRepeat).toBeFalse();
  expect(next.actionID).not.toBe(first.actionID);
});

test('it queues nothing once the step lost its lease', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  ctx.clock.advance(step.lease.expiresAt - ctx.clock.now());

  const create = queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await create.catch(() => {});

  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();

  expect(create).rejects.toThrow(LeaseLostError);
  expect(actions).toStrictEqual([]);
});

test('it reaches queue.commit.before and queue.commit.after around the queue', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const reached: FaultPointID[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  expect(reached).toStrictEqual(['queue.commit.before', 'queue.commit.after']);
});

test('it leaves no queue fault point in a release bundle', async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, 'create-allowed-action.ts')],
    target: 'bun',
    define: { NIXIE_TEST_BUILD: 'false' },
  });

  const texts = await Promise.all(build.outputs.map((output) => output.text()));

  expect(texts.join('\n')).not.toInclude('queue.commit.');
});

test('it keeps both queue fault points in a test bundle', async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, 'create-allowed-action.ts')],
    target: 'bun',
    define: { NIXIE_TEST_BUILD: 'true' },
  });

  const texts = await Promise.all(build.outputs.map((output) => output.text()));

  expect(texts.join('\n')).toIncludeMultiple(['queue.commit.before', 'queue.commit.after']);
});

test('it queues nothing for the rerun of a step whose action holds the hash from before destinations joined it', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const first = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: buildActionHash('test.send', { to: 'team' }),
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const rerun = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'a-hash-that-covers-destinations-and-the-deadline',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();

  expect(rerun).toStrictEqual({ actionID: first.actionID, status: 'pending', isRepeat: true });
  expect(actions).toHaveLength(1);
});

test('it charges the budget of the lift to the action it queues', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await createAllowedAction(ctx.context, buildMockLiftedCall(step, 4_000_000));
  const ledger = await ctx.readLedger();

  invariant('actionID' in queued);

  expect(ledger?.charges).toStrictEqual([
    {
      chargeID: expect.any(String),
      amountMicros: 4_000_000,
      for: { kind: 'action', id: queued.actionID },
      isCredited: false,
    },
  ]);
});

test('it queues one of two purchases that cannot both fit under the budget', async () => {
  const ctx = await setupTest();
  const first = await createTestStep(ctx.context);
  const second = await createTestStep(ctx.context);

  await Promise.all([
    createAllowedAction(ctx.context, buildMockLiftedCall(first, 6_000_000)),
    createAllowedAction(ctx.context, buildMockLiftedCall(second, 6_000_000)),
  ]);

  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();
  const ledger = await ctx.readLedger();

  expect(actions).toHaveLength(1);
  expect(ledger?.spentMicros).toBe(6_000_000);
});

test('it queues nothing and asks the owner, naming the budget and its reset, at the limit', async () => {
  const ctx = await setupTest();
  const first = await createTestStep(ctx.context);
  const second = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, buildMockLiftedCall(first, 6_000_000));

  const asked = await createAllowedAction(ctx.context, buildMockLiftedCall(second, 6_000_000));
  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();
  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  invariant('shortID' in asked);

  const proposals = records.filter((entry) => entry.record.kind === 'policy.action_proposed');

  expect(actions).toHaveLength(1);
  expect(proposals).toHaveLength(1);

  expect(proposals[0]?.record).toMatchObject({
    promptCause: 'always_ask',
    thread: second.lease.workID,
    payload: {
      shortID: asked.shortID,
      riskClass: 'always_ask',
      cause: 'always_ask',
      budgetReached: 'budget reached: groceries ($6.00 of $10.00). Resets at midnight.',
    },
  });
});

test('it answers a retry of a call the budget refused with the question already asked', async () => {
  const ctx = await setupTest();
  const first = await createTestStep(ctx.context);
  const second = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, buildMockLiftedCall(first, 6_000_000));

  const overBudget = buildMockLiftedCall(second, 6_000_000);

  const asked = await createAllowedAction(ctx.context, overBudget);
  const retried = await createAllowedAction(ctx.context, overBudget);
  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  invariant('shortID' in asked);

  expect(retried).toStrictEqual({ shortID: asked.shortID });
  expect(records.filter((entry) => entry.record.kind === 'policy.action_proposed')).toHaveLength(1);
});

test('it answers a retry of a call the owner declined in this run with that decline, and asks nothing', async () => {
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

  const overBudget = buildMockLiftedCall(step, 6_000_000);

  const asked = await createAllowedAction(ctx.context, overBudget);

  invariant('shortID' in asked);

  await seedDeclinedProposal(ctx.context, asked.shortID);

  const retried = await createAllowedAction(ctx.context, overBudget);
  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(retried).toStrictEqual({ declinedBy: asked.shortID });
  expect(records.filter((entry) => entry.record.kind === 'policy.action_proposed')).toHaveLength(1);
});

test('it asks again for a call the owner declined in an earlier run of the task', async () => {
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

  const sameRun = await createAllowedAction(ctx.context, buildMockLiftedCall(first, 6_000_000));

  await writeStepCommit(ctx.context, first, {
    next: 'wait',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'Done.' } },
  });

  const second = await seedOpenDefinitionRun(ctx.context, seed);
  const askedAgain = await createAllowedAction(ctx.context, buildMockLiftedCall(second, 6_000_000));
  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(sameRun).toStrictEqual({ declinedBy: asked.shortID });
  expect(askedAgain).toStrictEqual({ shortID: expect.any(String) });
  expect(askedAgain).not.toStrictEqual({ shortID: asked.shortID });
  expect(records.filter((entry) => entry.record.kind === 'policy.action_proposed')).toHaveLength(2);
});

test('it answers a card that an earlier run opened and the owner declined in this run with that decline', async () => {
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

  await writeStepCommit(ctx.context, first, {
    next: 'wait',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'Done.' } },
  });

  const second = await seedOpenDefinitionRun(ctx.context, seed);

  await seedDeclinedProposal(ctx.context, asked.shortID);

  const retried = await createAllowedAction(ctx.context, buildMockLiftedCall(second, 6_000_000));

  expect(retried).toStrictEqual({ declinedBy: asked.shortID });
});

test('it queues a retry of a declined purchase once the budget has room again', async () => {
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
  await writeTaskControl(ctx.context, { taskID: spender.lease.workID, control: 'stop' });

  const retried = await createAllowedAction(ctx.context, buildMockLiftedCall(step, 6_000_000));

  expect(retried).toStrictEqual({
    actionID: expect.any(String),
    status: 'pending',
    isRepeat: false,
  });
});

test('it credits the charge of an action that failed', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, buildMockLiftedCall(step, 4_000_000));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'refused', reason: 'the shop said no' }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.buy', stub.connector]]),
    leaseMs: 60_000,
  });

  const ledger = await ctx.readLedger();

  expect(ledger?.spentMicros).toBe(0);
});

test('it credits the charge of an action that a stop cancelled', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, buildMockLiftedCall(step, 4_000_000));
  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });

  const ledger = await ctx.readLedger();

  expect(ledger?.spentMicros).toBe(0);
});

test('it keeps the charge of an action whose outcome is unknown', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, buildMockLiftedCall(step, 4_000_000));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'the connection dropped' }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.buy', stub.connector]]),
    leaseMs: 60_000,
  });

  const ledger = await ctx.readLedger();

  expect(ledger?.spentMicros).toBe(4_000_000);
});
