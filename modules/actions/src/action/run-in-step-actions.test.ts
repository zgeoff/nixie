import { expect, onTestFinished, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { setFaultPointHandler } from '@heynixie/tasks';
import type { ApprovedCallRequest, ApprovedRun } from '@heynixie/tools';
import { buildActionSeeder } from '../test-utils/build-action-seeder';
import { createTestStep } from '../test-utils/create-test-step';
import { readTestAction } from '../test-utils/read-test-action';
import { startTestActions } from '../test-utils/start-test-actions';
import type { AttemptVerdict } from './attempt-check';
import { claimAction } from './claim-action';
import { probeInStepActionPending, runInStepActions } from './run-in-step-actions';
import { writeUnknownAnswer } from './write-unknown-answer';

async function setupTest() {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  const seed = buildActionSeeder({ context: actions.context });
  const calls: ApprovedCallRequest[] = [];

  const runCall = (run: ApprovedRun) => (request: ApprovedCallRequest) => {
    calls.push(request);

    return Promise.resolve(run);
  };

  return {
    ...actions,
    step,
    seed,
    calls,
    runCall,
    runStep: (options: Parameters<typeof runInStepActions>[2]) =>
      runInStepActions(actions.context, step.lease, options),
    readOutcome: async (sequence: number) => {
      const [entry] = await readRecords(actions.context.log, {
        afterSequence: sequence - 1,
        limit: 1,
      });

      return entry?.record;
    },
  };
}

test('it runs the approved call once, with the arguments and hash the owner approved', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
  });

  expect(ctx.calls).toStrictEqual([
    {
      actionID: queued.action_id,
      tool: 'test.read',
      input: { query: 'tomatoes' },
      callSequence: 1,
      actionHash: queued.action_hash,
    },
  ]);
});

test('it settles the action done and names the result record in its outcome', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  const settled = await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
  });

  const action = await readTestAction(ctx.writer, queued.action_id);

  const [first] = settled;

  const outcome = await ctx.readOutcome(first?.outcomeSequence ?? 0);

  expect(action).toMatchObject({ status: 'done', attempt_count: 1, attempt_open: 0 });

  expect(outcome?.payload).toStrictEqual({
    actionID: queued.action_id,
    tool: 'test.read',
    status: 'done',
    attempt: 1,
    reason: null,
    resultSequence: 7,
  });
});

test('it hands back what the call returned beside the outcome, for the turn to read in full', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  const settled = await ctx.runStep({
    runCall: ctx.runCall({
      status: 'done',
      resultSequence: 7,
      result: { text: 'The ferry leaves at nine.' },
      images: [],
    }),
  });

  expect(settled).toStrictEqual([
    {
      actionID: queued.action_id,
      outcomeSequence: expect.any(Number),
      reply: { result: { text: 'The ferry leaves at nine.' }, images: [] },
    },
  ]);
});

test('it keeps the step lease after the run', async () => {
  const ctx = await setupTest();

  await ctx.seed.inStepAction({ step: ctx.step });

  await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
  });

  const again = await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 8, result: {}, images: [] }),
  });

  expect(again).toStrictEqual([]);
});

test('it runs nothing for a second run of an action it already settled', async () => {
  const ctx = await setupTest();

  await ctx.seed.inStepAction({ step: ctx.step });

  const run = ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] });

  await ctx.runStep({ runCall: run });
  await ctx.runStep({ runCall: run });

  expect(ctx.calls).toHaveLength(1);
});

test('it fails the action when the tool failed, and names the result of the failure', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  await ctx.runStep({ runCall: ctx.runCall({ status: 'failed', resultSequence: 9 }) });

  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(action).toMatchObject({ status: 'failed', reason: 'refused' });
});

test('it fails the action refused, with the code in its outcome, when the tool refused the call', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  const settled = await ctx.runStep({
    runCall: ctx.runCall({
      status: 'refused',
      resultSequence: 9,
      code: 'ID_TAKEN',
      result: { refused: { code: 'ID_TAKEN' } },
      images: [],
    }),
  });

  const [first] = settled;

  const outcome = await ctx.readOutcome(first?.outcomeSequence ?? 0);

  expect({ payload: outcome?.payload, erasable: outcome?.erasable }).toStrictEqual({
    payload: {
      actionID: queued.action_id,
      tool: 'test.read',
      status: 'failed',
      attempt: 1,
      reason: 'refused',
      resultSequence: 9,
    },
    erasable: {
      status: 'readable',
      fields: { message: 'the tool refused the call: ID_TAKEN' },
    },
  });
});

test('it hands back the result of a refused call, for the turn to read', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  const settled = await ctx.runStep({
    runCall: ctx.runCall({
      status: 'refused',
      resultSequence: 9,
      code: 'ID_TAKEN',
      result: { refused: { code: 'ID_TAKEN' } },
      images: [],
    }),
  });

  expect(settled).toStrictEqual([
    {
      actionID: queued.action_id,
      outcomeSequence: expect.any(Number),
      reply: { result: { refused: { code: 'ID_TAKEN' } }, images: [] },
    },
  ]);
});

test.each([
  ['unavailable', 'unknown_tool'],
  ['changed', 'arguments_unreadable'],
] as const)('it fails a call the endpoint reports %s as %s', async (status, reason) => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  await ctx.runStep({ runCall: ctx.runCall({ status }) });

  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(action).toMatchObject({ status: 'failed', reason });
});

test('it fails the action rule_denied and runs no call when policy now denies it', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  const deny: AttemptVerdict = {
    kind: 'deny',
    rule: { id: 'never-read', revision: 2 },
    message: 'rule never-read (r2)',
  };

  await ctx.runStep({
    checkAttempt: () => Promise.resolve(deny),
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
  });

  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(ctx.calls).toStrictEqual([]);
  expect(action).toMatchObject({ status: 'failed', reason: 'rule_denied', attempt_count: 0 });
});

test('it fails the action deadline_passed and runs no call once its deadline passed', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step, deadlineAt: 999_000 });

  await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
  });

  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(ctx.calls).toStrictEqual([]);
  expect(action).toMatchObject({ status: 'failed', reason: 'deadline_passed' });
});

test('it holds the action and runs no call when policy asks again of a routine approval', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  const ask: AttemptVerdict = {
    kind: 'ask',
    cause: 'always_ask',
    destinations: [],
    proposalID: 'proposal-2',
    record: {
      kind: 'policy.action_proposed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: ctx.step.lease.workID,
      payload: {},
    },
  };

  const settled = await ctx.runStep({
    checkAttempt: () => Promise.resolve(ask),
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
  });

  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(ctx.calls).toStrictEqual([]);
  expect(settled).toStrictEqual([]);
  expect(action.held_by_proposal_id).toBe('proposal-2');
});

test('it settles an attempt that a crash left open as unknown and never reruns the call', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  const crash = await ctx
    .runStep({ runCall: () => Promise.reject(new Error('the process died')) })
    .then(
      () => null,
      (error: unknown) => error,
    );

  const open = await readTestAction(ctx.writer, queued.action_id);

  const settled = await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
  });

  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(crash).toBeInstanceOf(Error);
  expect(open).toMatchObject({ status: 'pending', attempt_open: 1 });
  expect(ctx.calls).toStrictEqual([]);
  expect(settled).toHaveLength(1);
  expect(action).toMatchObject({ status: 'unknown', reason: 'attempt_without_result' });
});

test('it never claims an action that the step runs', async () => {
  const ctx = await setupTest();

  await ctx.seed.inStepAction({ step: ctx.step });

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toBeNull();
});

test('it reports a pending approved call, and none once the call settled', async () => {
  const ctx = await setupTest();

  await ctx.seed.inStepAction({ step: ctx.step });

  const before = await probeInStepActionPending(ctx.context, ctx.step.lease.workID);

  await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
  });

  const after = await probeInStepActionPending(ctx.context, ctx.step.lease.workID);

  expect([before, after]).toStrictEqual([true, false]);
});

test('it runs the call once more after the owner answers retry to the unknown outcome, and wakes the task', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  await ctx
    .runStep({ runCall: () => Promise.reject(new Error('the process died')) })
    .catch(() => null);

  await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
  });

  const answered = await withWriteTransaction(ctx.writer, (tx) =>
    writeUnknownAnswer(tx, ctx.context, {
      actionID: queued.action_id,
      choice: 'retry',
      identityID: 'identity-1',
    }),
  );

  const retried = await readTestAction(ctx.writer, queued.action_id);

  await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 8, result: {}, images: [] }),
  });

  await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 9, result: {}, images: [] }),
  });

  const kinds = await readRecords(ctx.context.log, { afterSequence: 0 });
  const settled = await readTestAction(ctx.writer, queued.action_id);

  expect(answered).toBe(true);
  expect(retried).toMatchObject({ status: 'pending', attempt_open: 0 });
  expect(ctx.calls).toHaveLength(1);
  expect(settled).toMatchObject({ status: 'done', attempt_open: 0 });
  expect(kinds.map((entry) => entry.record.kind)).toContain('task.wake');
});

test('it runs nothing for an action of a held tool prefix, and shows none pending', async () => {
  const ctx = await setupTest();

  await ctx.seed.inStepAction({ step: ctx.step });

  const settled = await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
    readHeldToolPrefixes: () => ['test.'],
  });

  const isPending = await probeInStepActionPending(ctx.context, ctx.step.lease.workID, () => [
    'test.',
  ]);

  expect([settled, ctx.calls, isPending]).toStrictEqual([[], [], false]);
});

test('it shows the action pending again once its prefix is free', async () => {
  const ctx = await setupTest();

  await ctx.seed.inStepAction({ step: ctx.step });

  const isPending = await probeInStepActionPending(ctx.context, ctx.step.lease.workID, () => []);

  expect(isPending).toBe(true);
});

test('it runs no call for an action when a hold begins after the batch was read', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  const hold: { prefixes: string[] } = { prefixes: [] };

  const settled = await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
    readHeldToolPrefixes: () => hold.prefixes,
    checkAttempt: () => {
      hold.prefixes = ['test.'];

      return Promise.resolve({ kind: 'go', destinations: [] });
    },
  });

  const action = await readTestAction(ctx.writer, queued.action_id);

  expect([settled, ctx.calls, action.status, action.attempt_count]).toStrictEqual([
    [],
    [],
    'pending',
    0,
  ]);
});

test('it runs no call and records no attempt when a hold begins between the last check and the commit', async () => {
  const ctx = await setupTest();
  const queued = await ctx.seed.inStepAction({ step: ctx.step });

  const hold: { isHeld: boolean } = { isHeld: false };

  setFaultPointHandler((id) => {
    if (id === 'attempt.admit.before') {
      hold.isHeld = true;
    }
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  const settled = await ctx.runStep({
    runCall: ctx.runCall({ status: 'done', resultSequence: 7, result: {}, images: [] }),
    readHeldToolPrefixes: () => (hold.isHeld ? ['test.'] : []),
    admitTool: () => (hold.isHeld ? null : () => {}),
    checkAttempt: () => Promise.resolve({ kind: 'go', destinations: [] }),
  });

  const action = await readTestAction(ctx.writer, queued.action_id);

  expect([settled, ctx.calls, action.status, action.attempt_count]).toStrictEqual([
    [],
    [],
    'pending',
    0,
  ]);
});
