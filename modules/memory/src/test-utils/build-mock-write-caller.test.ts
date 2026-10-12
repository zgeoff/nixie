import { expect, test } from 'bun:test';
import { buildMockWriteCaller } from './build-mock-write-caller';

test('it builds a default write caller', () => {
  expect(buildMockWriteCaller()).toStrictEqual({
    origin: 'conversation',
    thread: 'conversation',
    taskID: 'conversation',
    runID: 'conversation',
    model: expect.toStartWith('claude-'),
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockWriteCaller({ origin: 'task', thread: 'task-3', model: 'model-a' }),
  ).toStrictEqual({
    origin: 'task',
    thread: 'task-3',
    taskID: 'conversation',
    runID: 'conversation',
    model: 'model-a',
  });
});
