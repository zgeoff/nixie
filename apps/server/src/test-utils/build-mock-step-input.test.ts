import { expect, test } from 'bun:test';
import { buildMockStepInput } from './build-mock-step-input';

test('it builds a default step input', () => {
  expect(buildMockStepInput()).toStrictEqual({
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
    signal: expect.any(AbortSignal),
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockStepInput({ stepKey: 'conversation:4', sessionBoundary: 'boundary-3' }),
  ).toMatchObject({ stepKey: 'conversation:4', sessionBoundary: 'boundary-3', inbox: [] });
});
