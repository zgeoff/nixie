import { expect, test } from 'bun:test';
import { contract } from '@heynixie/contract';
import { buildMockListedTask } from './build-mock-listed-task';

test('it builds a waiting task with no actions that the task list output accepts', () => {
  const task = buildMockListedTask();

  const parsed = contract.tasks.list['~orpc'].outputSchema?.['~standard'].validate({
    readAtSequence: 0,
    tasks: [task],
  });

  expect(parsed).toStrictEqual({ value: { readAtSequence: 0, tasks: [task] } });
});

test('it keeps the fields a test gives', () => {
  expect(
    buildMockListedTask({ name: 'Garden plan', state: 'paused', taskID: 'k3vq8m2xpa' }),
  ).toMatchObject({ name: 'Garden plan', state: 'paused', taskID: 'k3vq8m2xpa' });
});
