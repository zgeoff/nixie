import { expect, test } from 'bun:test';
import { buildMockAllowedCall } from './build-mock-allowed-call';
import { createTestStep } from './create-test-step';
import { queueTestAction } from './queue-test-action';
import { readTestAction } from './read-test-action';
import { startTestActions } from './start-test-actions';

function setupTest() {
  return startTestActions();
}

test('it reads the row of one action by its ID', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, buildMockAllowedCall({ step }));

  const second = await queueTestAction(
    ctx.context,
    buildMockAllowedCall({ step, tool: 'test.archive' }),
  );

  const row = await readTestAction(ctx.writer, second.actionID);

  expect(row).toMatchObject({ action_id: second.actionID, tool: 'test.archive' });
});

test('it throws for an unknown action ID', async () => {
  const ctx = await setupTest();

  expect(readTestAction(ctx.writer, 'missing')).rejects.toThrow();
});
