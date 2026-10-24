import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderHeldMessages } from './render-held-messages';
import { buildMockTaskMessageView } from './test-utils/build-mock-task-message-view';

test('it adds no block when no message arrived past the hop limit', () => {
  const record = buildMockLogRecord({
    kind: 'task_message',
    thread: 'conversation',
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'memory-writer',
      to: 'conversation',
      kind: 'chat',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: false,
      woke: false,
      source: 'task:memory-writer',
    },
  });

  expect(
    renderHeldMessages(
      [record],
      { defaultZone: 'UTC', now: new Date('2026-10-13T05:00:00Z') },
      buildMockTaskMessageView(),
    ),
  ).toBeNull();
});

test('it counts the messages past the hop limit by their sender in one system message', () => {
  const records = ['k3vq8m2xpa', 'w7tn4c9rhz'].map((messageID) =>
    buildMockLogRecord({
      kind: 'task_message',
      thread: 'conversation',
      payload: {
        messageID,
        from: 'memory-writer',
        to: 'conversation',
        kind: 'chat',
        replyTo: null,
        onBehalfOf: [],
        hop: 21,
        hopLimit: 20,
        wake: true,
        woke: false,
        source: 'task:memory-writer',
      },
    }),
  );

  const block = renderHeldMessages(
    records,
    { defaultZone: 'UTC', now: new Date('2026-10-13T05:00:00Z') },
    buildMockTaskMessageView({
      messaging: {
        directory: [
          {
            taskID: 'memory-writer',
            name: 'Memory writer',
            brief: 'Saves memories.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 20,
        ownerName: 'Robin',
      },
    }),
  );

  const blockID = /id="(?<blockID>\w+)"/u.exec(block ?? '')?.groups?.['blockID'];

  expect(block).toBe(
    [
      `<system-message type="task-messages" id="${blockID}" at="Tue 13 Oct, 05:00, UTC">`,
      '2 messages from Memory writer arrived after the exchange reached its limit, so they did not wake you. Oldest first. You woke for a message from Robin, so a reply from you will wake Memory writer.',
      `</system-message id="${blockID}">`,
    ].join('\n'),
  );
});
