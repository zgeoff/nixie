import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { runRecovery, setFaultPointHandler } from '@heynixie/tasks';
import { readTestLeases, readTestTasks, startNextTestWriter } from '@heynixie/tasks/test-utils';
import { createAllowedAction } from './create-allowed-action';
import { createTestStep } from './test-utils/create-test-step';
import { runStalledAttempt } from './test-utils/run-stalled-attempt';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';
import { writeUnknownOutcomes } from './write-unknown-outcomes';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions };
}

test('it marks an action whose attempt record has no result unknown', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await runStalledAttempt(ctx);

  const before = await ctx.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['status', 'attempt_open'])
    .executeTakeFirstOrThrow();

  const next = await startNextTestWriter(ctx);

  await writeUnknownOutcomes(next.context);

  const after = await next.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .selectAll()
    .executeTakeFirstOrThrow();

  expect(before).toStrictEqual({ status: 'pending', attempt_open: 1 });

  expect(after).toMatchObject({
    status: 'unknown',
    attempt_count: 1,
    attempt_open: 0,
    reason: 'attempt_without_result',
  });
});

test('it writes the unknown outcome to the task inbox', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await runStalledAttempt(ctx);

  const before = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['action.outcome'],
  });

  const next = await startNextTestWriter(ctx);

  await writeUnknownOutcomes(next.context);

  const records = await readRecords(next.context.log, {
    afterSequence: 0,
    kinds: ['action.outcome'],
  });

  expect(before).toStrictEqual([]);

  expect(records.map((read) => [read.record.kind, read.record.thread])).toStrictEqual([
    ['action.outcome', step.lease.workID],
  ]);
});

test('it runs as recovery step 3, between the interrupted steps and the late timers', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const reached: string[] = [];

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await runStalledAttempt(ctx);

  const next = await startNextTestWriter(ctx);

  setFaultPointHandler((id) => {
    reached.push(id);
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await runRecovery(next.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(next.context),
    sandboxes: { removeStaleSandboxes: () => Promise.resolve() },
  });

  expect(reached).toStrictEqual([
    'recovery.step.1',
    'recovery.step.2',
    'inbox.write.after',
    'recovery.step.3',
    'recovery.step.4',
    'recovery.step.5',
  ]);
});

test('it frees the step and the action leases through recovery', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await runStalledAttempt(ctx);

  const held = await readTestLeases(ctx.writer);
  const next = await startNextTestWriter(ctx);

  await runRecovery(next.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(next.context),
    sandboxes: { removeStaleSandboxes: () => Promise.resolve() },
  });

  const leases = await readTestLeases(next.writer);

  expect(held.map((lease) => lease.holder)).toStrictEqual([
    expect.toBeString(),
    expect.toBeString(),
  ]);

  expect(leases.map((lease) => lease.holder)).toStrictEqual([null, null]);
});

test('it readies the task through recovery', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await runStalledAttempt(ctx);

  const [before] = await readTestTasks(ctx.writer);
  const next = await startNextTestWriter(ctx);

  await runRecovery(next.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(next.context),
    sandboxes: { removeStaleSandboxes: () => Promise.resolve() },
  });

  const [task] = await readTestTasks(next.writer);

  expect(before?.state).toBe('running');
  expect(task?.state).toBe('ready');
});

test('it leaves an action with no open attempt as it was', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await runStalledAttempt(ctx);

  const next = await startNextTestWriter(ctx);

  await writeUnknownOutcomes(next.context);
  await writeUnknownOutcomes(next.context);

  const outcomes = await readRecords(next.context.log, {
    afterSequence: 0,
    kinds: ['action.outcome'],
  });

  expect(outcomes).toHaveLength(1);
});
