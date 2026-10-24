import { expect, test } from 'bun:test';
import { buildStepRunID } from './build-step-run-id';

test('it names a claim by its step key and its lease generation', () => {
  expect(
    buildStepRunID({
      stepKey: 'conversation:4',
      wake: { hop: 0, cause: { kind: 'owner' } },
      lease: {
        kind: 'task',
        workID: 'conversation',
        holder: 'runner-a',
        generation: 2,
        epoch: 1,
        expiresAt: 1_060_000,
      },
    }),
  ).toBe('conversation:4@2');
});
