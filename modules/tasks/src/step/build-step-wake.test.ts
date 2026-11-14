import { expect, test } from 'bun:test';
import { buildStepWake } from './build-step-wake';

test('it counts a step woken by the owner as hop 0, whatever hop it carried', () => {
  expect(
    buildStepWake([{ kind: 'owner_message', thread: 'conversation', payload: {} }], 7),
  ).toStrictEqual({ hop: 0, cause: { kind: 'owner' } });
});

test('it counts a step woken by a timer as hop 0', () => {
  expect(buildStepWake([{ kind: 'timer.fired', thread: 'planner', payload: {} }], 7)).toStrictEqual(
    { hop: 0, cause: { kind: 'timer' } },
  );
});

test('it counts a step woken by a schedule wake as hop 0, from an outside event', () => {
  expect(buildStepWake([{ kind: 'task.wake', thread: 'planner', payload: {} }], 7)).toStrictEqual({
    hop: 0,
    cause: { kind: 'event' },
  });
});

test("it counts a step woken by a task message at the message's hop", () => {
  expect(
    buildStepWake(
      [
        {
          kind: 'task_message',
          thread: 'conversation',
          payload: {
            messageID: 'k3vq8m2xpa',
            from: 'planner',
            to: 'conversation',
            kind: 'chat',
            replyTo: null,
            onBehalfOf: [],
            hop: 4,
            hopLimit: 20,
            wake: true,
            woke: true,
            source: 'task:planner',
          },
        },
      ],
      0,
    ),
  ).toStrictEqual({ hop: 4, cause: { kind: 'task', taskID: 'planner' } });
});

test('it takes the lowest hop of the records that woke the step', () => {
  expect(
    buildStepWake(
      [
        {
          kind: 'task_message',
          thread: 'conversation',
          payload: {
            messageID: 'k3vq8m2xpa',
            from: 'planner',
            to: 'conversation',
            kind: 'chat',
            replyTo: null,
            onBehalfOf: [],
            hop: 4,
            hopLimit: 20,
            wake: true,
            woke: true,
            source: 'task:planner',
          },
        },
        { kind: 'owner_message', thread: 'conversation', payload: {} },
      ],
      0,
    ),
  ).toStrictEqual({ hop: 0, cause: { kind: 'owner' } });
});

test('it takes the lower hop and its sender of two task messages that woke the step', () => {
  expect(
    buildStepWake(
      [
        {
          kind: 'task_message',
          thread: 'conversation',
          payload: {
            messageID: 'k3vq8m2xpa',
            from: 'critic',
            to: 'conversation',
            kind: 'chat',
            replyTo: null,
            onBehalfOf: [],
            hop: 5,
            hopLimit: 20,
            wake: true,
            woke: true,
            source: 'task:critic',
          },
        },
        {
          kind: 'task_message',
          thread: 'conversation',
          payload: {
            messageID: 'w7tn4c9rhz',
            from: 'planner',
            to: 'conversation',
            kind: 'chat',
            replyTo: null,
            onBehalfOf: [],
            hop: 2,
            hopLimit: 20,
            wake: true,
            woke: true,
            source: 'task:planner',
          },
        },
      ],
      0,
    ),
  ).toStrictEqual({ hop: 2, cause: { kind: 'task', taskID: 'planner' } });
});

test('it leaves out a message that did not wake the task', () => {
  expect(
    buildStepWake(
      [
        {
          kind: 'task_message',
          thread: 'conversation',
          payload: {
            messageID: 'k3vq8m2xpa',
            from: 'planner',
            to: 'conversation',
            kind: 'chat',
            replyTo: null,
            onBehalfOf: [],
            hop: 1,
            hopLimit: 20,
            wake: false,
            woke: false,
            source: 'task:planner',
          },
        },
      ],
      6,
    ),
  ).toStrictEqual({ hop: 6, cause: { kind: 'carried' } });
});

test('it carries the hop of the step before when nothing new woke the step', () => {
  expect(buildStepWake([], 6)).toStrictEqual({ hop: 6, cause: { kind: 'carried' } });
});
