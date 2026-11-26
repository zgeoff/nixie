import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { buildStubConnector } from '../test-utils/build-stub-connector';
import { claimTestAction } from '../test-utils/claim-test-action';
import { createTestStep } from '../test-utils/create-test-step';
import { queueTestAction } from '../test-utils/queue-test-action';
import { readTestAction } from '../test-utils/read-test-action';
import { startTestActions } from '../test-utils/start-test-actions';
import { failHeldAction } from './fail-held-action';
import { runActionAttempt } from './run-action-attempt';

async function setupTest() {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  const queued = await queueTestAction(actions.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    callSequence: 1,
  });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  const lease = await claimTestAction(actions.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(actions.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    checkAttempt: () =>
      Promise.resolve({
        kind: 'ask',
        cause: 'ask_rule',
        destinations: ['team'],
        proposalID: queued.actionID,
        proposal: {
          definitions: { snapshotHash: 'sha256:test' },
          thread: step.lease.workID,
          callSequence: 1,
          tool: 'test.send',
          effects: ['send'],
          cause: 'ask_rule',
          input: { to: 'team' },
          destinations: [{ value: 'team', replyTarget: false }],
          reopen: { proposalID: queued.actionID, actionID: queued.actionID },
        },
      }),
  });

  return {
    ...actions,
    actionID: queued.actionID,
    failHeld: (proposalID: string, reason: 'declined' | 'lapsed') =>
      withWriteTransaction(actions.writer, (tx) =>
        failHeldAction(tx, actions.context, { proposalID, reason }),
      ),
    readAction: () => readTestAction(actions.writer, queued.actionID),
  };
}

test.each(['declined', 'lapsed'] as const)(
  'it fails the action a proposal held when the proposal is %s',
  async (reason) => {
    const ctx = await setupTest();

    await ctx.failHeld(ctx.actionID, reason);

    const action = await ctx.readAction();

    expect(action).toMatchObject({ status: 'failed', reason, held_by_proposal_id: null });
  },
);

test('it names the call in the outcome of the action a declined proposal held', async () => {
  const ctx = await setupTest();

  await ctx.failHeld(ctx.actionID, 'declined');

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['action.outcome'],
  });

  expect(entries.map((entry) => entry.record.payload)).toStrictEqual([
    { actionID: ctx.actionID, tool: 'test.send', status: 'failed', attempt: 0, reason: 'declined' },
  ]);
});

test('it fails nothing for a proposal that held no action', async () => {
  const ctx = await setupTest();

  await ctx.failHeld('another-proposal', 'declined');

  const action = await ctx.readAction();

  expect(action).toMatchObject({ status: 'pending', held_by_proposal_id: ctx.actionID });
});
