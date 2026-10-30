import { expect, test } from 'bun:test';
import { writeTaskControl } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { createAllowedAction } from './create-allowed-action';
import { readStopCancelledActions } from './read-stop-cancelled-actions';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';

async function setupTest() {
  const actions = await startTestActions();

  return { context: actions.context };
}

test('it lists the actions each stop cancelled under that stop', async () => {
  const ctx = await setupTest();
  const firstStep = await createTestStep(ctx.context);

  const first = await createAllowedAction(ctx.context, {
    step: firstStep,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const firstStop = await writeTaskControl(ctx.context, {
    taskID: firstStep.lease.workID,
    control: 'stop',
  });

  const secondStep = await createTestStep(ctx.context);

  const second = await createAllowedAction(ctx.context, {
    step: secondStep,
    tool: 'test.archive',
    actionHash: 'sha256:archive-1',
    arguments: { folder: 'receipts' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const secondStop = await writeTaskControl(ctx.context, {
    taskID: secondStep.lease.workID,
    control: 'stop',
  });

  invariant(firstStop.status === 'controlled');
  invariant(secondStop.status === 'controlled');

  const cancelled = await readStopCancelledActions(ctx.context, [
    firstStop.sequence,
    secondStop.sequence,
  ]);

  expect(cancelled).toStrictEqual(
    new Map([
      [firstStop.sequence, [{ actionID: first.actionID, tool: 'test.send' }]],
      [secondStop.sequence, [{ actionID: second.actionID, tool: 'test.archive' }]],
    ]),
  );
});

test('it lists no action under a stop that cancelled none', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const stop = await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });

  invariant(stop.status === 'controlled');

  const cancelled = await readStopCancelledActions(ctx.context, [stop.sequence]);

  expect(cancelled).toStrictEqual(new Map([[stop.sequence, []]]));
});
