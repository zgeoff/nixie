import { expect, test } from 'bun:test';
import { createTestStep } from './create-test-step';
import { queueTestAction } from './queue-test-action';
import { readTestAction } from './read-test-action';
import { seedStoredArguments } from './seed-stored-arguments';
import { startTestActions } from './start-test-actions';

async function setupTest() {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  const call = {
    step,
    tool: 'test.send',
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  } as const;

  const first = await queueTestAction(actions.context, {
    ...call,
    actionHash: 'sha256:first',
    arguments: { to: 'team' },
  });

  const second = await queueTestAction(actions.context, {
    ...call,
    actionHash: 'sha256:second',
    arguments: { to: 'everyone' },
  });

  return { ...actions, first, second };
}

test('it points an action at the queued record of another', async () => {
  const ctx = await setupTest();

  await seedStoredArguments(ctx.writer, {
    actionID: ctx.first.actionID,
    fromActionID: ctx.second.actionID,
  });

  const first = await readTestAction(ctx.writer, ctx.first.actionID);
  const second = await readTestAction(ctx.writer, ctx.second.actionID);

  expect(first.queued_sequence).toBe(second.queued_sequence);
});
