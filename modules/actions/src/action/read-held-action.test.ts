import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { buildStubConnector } from '../test-utils/build-stub-connector';
import { claimTestAction } from '../test-utils/claim-test-action';
import { createTestStep } from '../test-utils/create-test-step';
import { queueTestAction } from '../test-utils/queue-test-action';
import { startTestActions } from '../test-utils/start-test-actions';
import { readHeldAction } from './read-held-action';
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

  return {
    ...actions,
    queued,
    taskID: step.lease.workID,
    holdAction: async () => {
      const lease = await claimTestAction(actions.context, { holder: 'runner-a', leaseMs: 60_000 });

      await runActionAttempt(actions.context, lease, {
        connectors: new Map([
          ['test.send', buildStubConnector(() => ({ kind: 'success', result: {} })).connector],
        ]),
        leaseMs: 60_000,
        checkAttempt: () =>
          Promise.resolve({
            kind: 'ask',
            cause: 'ask_rule',
            destinations: ['team'],
            proposalID: 'proposal-1',
            proposal: {
              definitions: { snapshotHash: 'sha256:test' },
              thread: step.lease.workID,
              callSequence: 1,
              tool: 'test.send',
              effects: ['send'],
              cause: 'ask_rule',
              input: { to: 'team' },
              destinations: [{ value: 'team', replyTarget: false }],
              reopen: { proposalID: 'proposal-1', actionID: queued.actionID },
            },
          }),
      });
    },
    readHeld: (actionID: string, proposalID: string) =>
      withWriteTransaction(actions.writer, (tx) =>
        readHeldAction(tx, actions.context, { actionID, proposalID }),
      ),
  };
}

test('it reads the hash and the stored arguments of the action that a proposal holds', async () => {
  const ctx = await setupTest();

  await ctx.holdAction();

  const held = await ctx.readHeld(ctx.queued.actionID, 'proposal-1');

  expect(held).toStrictEqual({
    actionID: ctx.queued.actionID,
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
  });
});

test('it reads no action for a proposal that holds none', async () => {
  const ctx = await setupTest();

  await ctx.holdAction();

  const held = await ctx.readHeld(ctx.queued.actionID, 'proposal-2');

  expect(held).toBeNull();
});

test('it reads no action that is not held', async () => {
  const ctx = await setupTest();
  const held = await ctx.readHeld(ctx.queued.actionID, 'proposal-1');

  expect(held).toBeNull();
});

test('it reads no action that a stop of its task cancelled', async () => {
  const ctx = await setupTest();

  await ctx.holdAction();

  await writeTaskControl(ctx.context, { taskID: ctx.taskID, control: 'stop' });

  const held = await ctx.readHeld(ctx.queued.actionID, 'proposal-1');

  expect(held).toBeNull();
});
