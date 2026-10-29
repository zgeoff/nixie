import { expect, test } from 'bun:test';
import { planMessageMove } from './plan-message-move';

test('it moves a routed message from the task it went to', () => {
  expect(
    planMessageMove(
      { kind: 'task', taskID: 'conversation' },
      {
        messageThread: 'conversation',
        routedTo: 'k3x9m2p7qa',
        fromState: 'waiting',
        targetState: 'waiting',
      },
    ),
  ).toStrictEqual({
    status: 'move',
    from: 'k3x9m2p7qa',
    isFromNotified: true,
    target: { kind: 'task', taskID: 'conversation' },
  });
});

test('it moves a message that went nowhere from the thread it was sent on', () => {
  expect(
    planMessageMove(
      { kind: 'task', taskID: 'k3x9m2p7qa' },
      { messageThread: 'conversation', routedTo: null, fromState: 'running', targetState: 'ready' },
    ),
  ).toMatchObject({ status: 'move', from: 'conversation' });
});

test('it leaves out the notice to a task that has finished', () => {
  expect(
    planMessageMove(
      { kind: 'task', taskID: 'conversation' },
      {
        messageThread: 'conversation',
        routedTo: 'k3x9m2p7qa',
        fromState: 'done',
        targetState: 'waiting',
      },
    ),
  ).toMatchObject({ status: 'move', isFromNotified: false });
});

test.each([
  ['a task that does not exist', null],
  ['a task that has finished', 'done'],
  ['a task that has failed', 'failed'],
] as const)('it refuses to move a message to %s', (_label, targetState) => {
  expect(
    planMessageMove(
      { kind: 'task', taskID: 'w8d2n5rt1c' },
      { messageThread: 'conversation', routedTo: null, fromState: 'waiting', targetState },
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'unknown_task' } });
});

test('it refuses a new task with a blank name', () => {
  expect(
    planMessageMove(
      { kind: 'new', name: ' ', brief: 'Find a plumber.' },
      { messageThread: 'conversation', routedTo: null, fromState: 'waiting', targetState: null },
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'empty_name' } });
});

test('it refuses a new task with a blank brief', () => {
  expect(
    planMessageMove(
      { kind: 'new', name: 'Plumber', brief: '' },
      { messageThread: 'conversation', routedTo: null, fromState: 'waiting', targetState: null },
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'empty_brief' } });
});
