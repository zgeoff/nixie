import { expect, test } from 'bun:test';
import { readBudgetLedger } from '@heynixie/budgets';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { buildActionProposalInput } from '@heynixie/policy';
import { writeStepCommit } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildMockLiftedCall } from '../test-utils/build-mock-lifted-call';
import { buildStubConnector } from '../test-utils/build-stub-connector';
import { claimTestAction } from '../test-utils/claim-test-action';
import { createTestStep } from '../test-utils/create-test-step';
import { queueTestAction } from '../test-utils/queue-test-action';
import { readTestAction } from '../test-utils/read-test-action';
import { startTestActions } from '../test-utils/start-test-actions';
import { startTestBudgetedActions } from '../test-utils/start-test-budgeted-actions';
import type { ActionsTables } from '../types';
import type { AttemptVerdict } from './attempt-check';
import { claimAction } from './claim-action';
import { createAllowedAction } from './create-allowed-action';
import type { ApprovedAction } from './create-approved-action';
import { createApprovedAction } from './create-approved-action';
import { runActionAttempt } from './run-action-attempt';

async function setupTest() {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  const taskID = step.lease.workID;

  const approve = (overrides: Partial<ApprovedAction>) =>
    withWriteTransaction(actions.writer, (tx) =>
      createApprovedAction(tx, actions.context, {
        proposalID: 'proposal-1',
        taskID,
        stepKey: null,
        tool: 'test.send',
        effects: ['send'],
        actionHash: 'sha256:approved',
        arguments: { to: 'team' },
        callSequence: 1,
        riskClass: 'routine',
        deadlineAt: null,
        runsInStep: false,
        ...overrides,
      }),
    );

  return {
    ...actions,
    step,
    taskID,
    approve,
    queueAllowed: () =>
      queueTestAction(actions.context, {
        step,
        tool: 'test.send',
        actionHash: 'sha256:send-1',
        arguments: { to: 'team' },
        decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
        callSequence: 1,
      }),
    readAction: (actionID: string) => readTestAction(actions.writer, actionID),
    readActions: () =>
      actions.writer.db.$extendTables<ActionsTables>().selectFrom('actions').selectAll().execute(),
    runNext: async (checkAttempt: (proposalID: string) => AttemptVerdict) => {
      const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

      const lease = await claimTestAction(actions.context, { holder: 'runner-a', leaseMs: 60_000 });

      await runActionAttempt(actions.context, lease, {
        connectors: new Map([['test.send', stub.connector]]),
        leaseMs: 60_000,
        checkAttempt: (input) => Promise.resolve(checkAttempt(input.proposalID)),
      });

      return stub;
    },
    buildProposal: (cause: 'always_ask' | 'ask_rule', actionID: string, proposalID: string) =>
      buildActionProposalInput({
        definitions: { snapshotHash: 'sha256:test' },
        thread: taskID,
        callSequence: 1,
        tool: 'test.send',
        effects: ['send'],
        cause,
        input: { to: 'team' },
        destinations: [{ value: 'team', replyTarget: false }],
        reopen: { proposalID, actionID },
      }).record,
  };
}

test('it queues an approved action once, under the ID of its proposal', async () => {
  const ctx = await setupTest();
  const firstID = await ctx.approve({});
  const secondID = await ctx.approve({});
  const rows = await ctx.readActions();

  expect([firstID, secondID]).toStrictEqual(['proposal-1', 'proposal-1']);

  expect(rows).toMatchObject([
    { action_id: 'proposal-1', is_approved: 1, risk_class: 'routine', status: 'pending' },
  ]);
});

test.each([
  [true, 1],
  [false, 0],
] as const)('it stores runsInStep %s as runs_in_step %s', async (runsInStep, stored) => {
  const ctx = await setupTest();

  await ctx.approve({ runsInStep });

  const rows = await ctx.readActions();

  expect(rows.map((row) => row.runs_in_step)).toStrictEqual([stored]);
});

test('it queues an approved action under the step of the call that asked', async () => {
  const ctx = await setupTest();

  await ctx.approve({ stepKey: 'task-1:3' });

  const rows = await ctx.readActions();

  expect(rows).toMatchObject([{ step_key: 'task-1:3', call_sequence: 1 }]);
});

test('it queues an approved action after the step of the call that asked has committed', async () => {
  const ctx = await setupTest();

  await writeStepCommit(ctx.context, ctx.step, { next: 'wait', records: [], acknowledged: [] });

  const actionID = await ctx.approve({ stepKey: ctx.step.stepKey });
  const action = await ctx.readAction(actionID);

  expect(action).toMatchObject({ status: 'pending', step_key: ctx.step.stepKey });
});

test('it fails an approved action that the owner approved past its deadline', async () => {
  const ctx = await setupTest();
  const actionID = await ctx.approve({ deadlineAt: 999_000 });
  const action = await ctx.readAction(actionID);

  expect(action).toMatchObject({ status: 'failed', reason: 'deadline_passed', attempt_count: 0 });
});

test('it names the tool in the outcome of an action approved past its deadline', async () => {
  const ctx = await setupTest();
  const actionID = await ctx.approve({ deadlineAt: 999_000 });

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['action.outcome'],
  });

  expect(entries.map((entry) => entry.record.payload)).toStrictEqual([
    { actionID, tool: 'test.send', status: 'failed', attempt: 0, reason: 'deadline_passed' },
  ]);
});

test('it releases the action a proposal held, and runs it once', async () => {
  const ctx = await setupTest();
  const queued = await ctx.queueAllowed();

  const held = await ctx.runNext(() => ({
    kind: 'ask',
    cause: 'ask_rule',
    destinations: ['team'],
    proposalID: queued.actionID,
    record: ctx.buildProposal('ask_rule', queued.actionID, queued.actionID),
  }));

  const releasedID = await ctx.approve({ proposalID: queued.actionID });
  const claimedAfter = await ctx.runNext(() => ({ kind: 'go', destinations: ['team'] }));
  const action = await ctx.readAction(queued.actionID);
  const rows = await ctx.readActions();

  expect(held.calls).toStrictEqual([]);
  expect(releasedID).toBe(queued.actionID);
  expect(claimedAfter.calls).toHaveLength(1);
  expect(action).toMatchObject({ status: 'done', is_approved: 1, held_by_proposal_id: null });
  expect(rows).toHaveLength(1);
});

test('it holds an approved action that falls in the always-ask set under a new proposal ID', async () => {
  const ctx = await setupTest();
  const actionID = await ctx.approve({});

  const heldIDs: string[] = [];

  const stub = await ctx.runNext((proposalID) => {
    heldIDs.push(proposalID);

    return {
      kind: 'ask',
      cause: 'always_ask',
      destinations: ['team'],
      proposalID,
      record: ctx.buildProposal('always_ask', actionID, proposalID),
    };
  });

  const action = await ctx.readAction(actionID);

  expect(heldIDs).toHaveLength(1);
  expect(heldIDs[0]).not.toBe(actionID);
  expect(action).toMatchObject({ held_by_proposal_id: heldIDs[0], attempt_count: 0 });
  expect(stub.calls).toStrictEqual([]);
});

test('it runs an approved action that a rule only asks about again', async () => {
  const ctx = await setupTest();
  const actionID = await ctx.approve({});

  const stub = await ctx.runNext((proposalID) => ({
    kind: 'ask',
    cause: 'ask_rule',
    destinations: ['team'],
    proposalID,
    record: ctx.buildProposal('ask_rule', actionID, proposalID),
  }));

  expect(stub.calls).toHaveLength(1);
});

test('it leaves a held action unclaimed until its proposal is answered', async () => {
  const ctx = await setupTest();
  const queued = await ctx.queueAllowed();

  await ctx.runNext(() => ({
    kind: 'ask',
    cause: 'ask_rule',
    destinations: ['team'],
    proposalID: queued.actionID,
    record: ctx.buildProposal('ask_rule', queued.actionID, queued.actionID),
  }));

  const claimed = await claimAction(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  expect(claimed).toBeNull();
});

test('it credits the lift charge of a held action that is approved past its deadline', async () => {
  const actions = await startTestBudgetedActions();
  const step = await createTestStep(actions.context);

  const call = buildMockLiftedCall(step, 6_000_000);

  const queued = await createAllowedAction(actions.context, call);

  invariant('actionID' in queued);

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  const lease = await claimTestAction(actions.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(actions.context, lease, {
    connectors: new Map([['test.buy', stub.connector]]),
    leaseMs: 60_000,
    checkAttempt: () =>
      Promise.resolve({
        kind: 'ask',
        cause: 'always_ask',
        destinations: [],
        proposalID: queued.actionID,
        record: buildActionProposalInput({
          definitions: { snapshotHash: 'sha256:test' },
          thread: step.lease.workID,
          callSequence: 1,
          tool: 'test.buy',
          effects: ['spend'],
          cause: 'always_ask',
          input: { amount: 6 },
          destinations: [],
          reopen: { proposalID: queued.actionID, actionID: queued.actionID },
        }).record,
      }),
  });

  await withWriteTransaction(actions.writer, (tx) =>
    createApprovedAction(tx, actions.context, {
      proposalID: queued.actionID,
      taskID: step.lease.workID,
      stepKey: null,
      tool: 'test.buy',
      effects: ['spend'],
      actionHash: call.actionHash,
      arguments: { amount: 6 },
      callSequence: 1,
      riskClass: 'always_ask',
      deadlineAt: 999_000,
      runsInStep: false,
    }),
  );

  const action = await readTestAction(actions.writer, queued.actionID);
  const ledger = await readBudgetLedger(actions.writer.db, actions.budgets, 'groceries');

  expect(action).toMatchObject({ status: 'failed', reason: 'deadline_passed' });
  expect(ledger?.spentMicros).toBe(0);
});
