import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderTaskMessage } from './render-task-message';
import { buildMockTaskMessageView } from './test-utils/build-mock-task-message-view';

test.each([
  ['under a minute', '2026-10-13T03:05:59Z'],
  ['1 min', '2026-10-13T03:06:00Z'],
  ['59 min', '2026-10-13T04:04:59Z'],
  ['1 h', '2026-10-13T04:05:00Z'],
  ['47 h', '2026-10-15T03:04:59Z'],
  ['2 days', '2026-10-15T03:05:00Z'],
])('it gives a message sent at 03:05 the age "%s" at %s', (age, now) => {
  const record = buildMockLogRecord({
    kind: 'task_message',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'conversation',
      to: 'conversation',
      kind: 'chat',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:conversation',
    },
    erasable: { status: 'readable', fields: { body: 'Done.' } },
  });

  expect(
    renderTaskMessage(
      record,
      { defaultZone: 'UTC', now: new Date(now) },
      buildMockTaskMessageView(),
    ),
  ).toInclude(` age="${age}" `);
});

test('it escapes a quote and an ampersand in a task name, so the name cannot end its attribute', () => {
  const record = buildMockLogRecord({
    kind: 'task_message',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'planner',
      to: 'conversation',
      kind: 'progress',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:planner',
    },
    erasable: { status: 'readable', fields: { body: 'Halfway.' } },
  });

  expect(
    renderTaskMessage(
      record,
      { defaultZone: 'UTC', now: new Date('2026-10-13T03:05:00Z') },
      buildMockTaskMessageView({
        messaging: {
          directory: [
            {
              taskID: 'planner',
              name: 'Plans & "trips"',
              brief: 'Plans trips.',
              isWokenByMessages: true,
            },
          ],
          hopLimit: 20,
          ownerName: null,
        },
      }),
    ),
  ).toInclude(' name="Plans &amp; &quot;trips&quot;" ');
});

test('it names the owner as the owner when the configuration gives no name', () => {
  const record = buildMockLogRecord({
    kind: 'task_message',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'conversation',
      to: 'conversation',
      kind: 'chat',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:conversation',
    },
    erasable: { status: 'readable', fields: { body: 'Done.' } },
  });

  expect(
    renderTaskMessage(
      record,
      { defaultZone: 'UTC', now: new Date('2026-10-13T03:05:00Z') },
      buildMockTaskMessageView(),
    ),
  ).toInclude('>\nThis message is from another task, not from the owner.\nDone.\n</task-message');
});
