import { expect, test } from 'bun:test';
import { buildMockStepInput } from './build-mock-step-input';

test('it builds a default step input', () => {
  const input = buildMockStepInput();

  expect(input).toContainAllKeys([
    'taskID',
    'stepKey',
    'lease',
    'inbox',
    'sessionBoundary',
    'signal',
  ]);

  expect(input.signal.aborted).toBe(false);

  expect(input).toMatchObject({
    taskID: 'conversation',
    stepKey: 'conversation:1',
    lease: {
      kind: 'task',
      workID: 'conversation',
      holder: expect.toBeString(),
      generation: 1,
      epoch: expect.toBeNumber(),
      expiresAt: expect.toBeNumber(),
    },
    inbox: [],
    sessionBoundary: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockStepInput({ stepKey: 'conversation:4', sessionBoundary: 'boundary-3' }),
  ).toMatchObject({ stepKey: 'conversation:4', sessionBoundary: 'boundary-3', inbox: [] });
});
