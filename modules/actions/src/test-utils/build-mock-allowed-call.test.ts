import { expect, test } from 'bun:test';
import { buildMockAllowedCall } from './build-mock-allowed-call';
import { createTestStep } from './create-test-step';
import { startTestActions } from './start-test-actions';

function setupTest() {
  return startTestActions();
}

test('it builds an allowed call with the step it is given and default fields', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  expect(buildMockAllowedCall({ step })).toStrictEqual({
    step,
    tool: 'test.send',
    actionHash: expect.stringMatching(/^sha256:/u),
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });
});

test('it applies overrides on top of the defaults', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  expect(buildMockAllowedCall({ step, tool: 'test.archive' })).toMatchObject({
    step,
    tool: 'test.archive',
  });
});

test('it gives each call its own action hash', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  expect(buildMockAllowedCall({ step }).actionHash).not.toBe(
    buildMockAllowedCall({ step }).actionHash,
  );
});
