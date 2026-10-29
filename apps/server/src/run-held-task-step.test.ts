import { expect, test } from 'bun:test';
import { runHeldTaskStep } from './run-held-task-step';

test('it holds the task with nothing written and nothing it read marked read', async () => {
  const result = await runHeldTaskStep();

  expect(result).toStrictEqual({ next: 'hold', records: [], acknowledged: [] });
});
