import { expect, test } from 'bun:test';
import { buildMockAllowedCall } from './build-mock-allowed-call';
import { createTestStep } from './create-test-step';
import { queueTestAction } from './queue-test-action';
import { startTestActions } from './start-test-actions';

test('#queueTestAction queues the call and returns its action', async () => {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);
  const queued = await queueTestAction(actions.context, buildMockAllowedCall({ step }));

  expect(queued).toStrictEqual({
    actionID: expect.any(String),
    status: 'pending',
    isRepeat: false,
  });
});
