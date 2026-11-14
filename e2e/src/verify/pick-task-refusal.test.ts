import { expect, test } from 'bun:test';
import { pickTaskRefusal } from './pick-task-refusal';

function setupTest() {
  const paused = {
    taskID: 'tsk-heron',
    name: 'Heron count',
    state: 'paused',
    records: ['task.created', 'task.step_committed', 'task.paused'],
  };

  return { paused };
}

test('#pickTaskRefusal accepts a task in the state whose record came last', () => {
  const setup = setupTest();

  expect(
    pickTaskRefusal([setup.paused], {
      name: 'Heron count',
      state: 'paused',
      record: 'task.paused',
    }),
  ).toBeNull();
});

test('#pickTaskRefusal refuses a task in another state', () => {
  const setup = setupTest();

  expect(
    pickTaskRefusal([setup.paused], {
      name: 'Heron count',
      state: 'waiting',
      record: 'task.paused',
    }),
  ).toBe('the task Heron count is paused, not waiting');
});

test('#pickTaskRefusal refuses a task whose last record is another', () => {
  const setup = setupTest();

  expect(
    pickTaskRefusal([setup.paused], {
      name: 'Heron count',
      state: 'paused',
      record: 'task.resumed',
    }),
  ).toBe('the last record of the task Heron count is task.paused, not task.resumed');
});

test('#pickTaskRefusal refuses a name that no task holds', () => {
  expect(pickTaskRefusal([], { name: 'Heron count', state: 'paused', record: 'task.paused' })).toBe(
    'tasks named Heron count: 0, not 1',
  );
});

test('#pickTaskRefusal refuses a name that two tasks hold', () => {
  const setup = setupTest();

  expect(
    pickTaskRefusal([setup.paused, { ...setup.paused, taskID: 'tsk-egret' }], {
      name: 'Heron count',
      state: 'paused',
      record: 'task.paused',
    }),
  ).toBe('tasks named Heron count: 2, not 1');
});
