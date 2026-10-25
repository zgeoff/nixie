import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderSessionMessages } from './render-session-messages';
import { buildMockTaskMessageView } from './test-utils/build-mock-task-message-view';

test('it adds nothing to a session prompt when the inbox holds no task message', () => {
  const wake = buildMockLogRecord({ kind: 'task.wake', thread: 'memory-writer', payload: {} });

  expect(
    renderSessionMessages(
      [wake],
      { defaultZone: 'UTC', now: new Date('2026-10-13T05:00:00Z') },
      buildMockTaskMessageView(),
    ),
  ).toBeNull();
});

test('it frames each task message in the inbox, after the note on messages past the hop limit', () => {
  const records = [
    buildMockLogRecord({
      kind: 'task_message',
      thread: 'memory-writer',
      recordedAt: new Date('2026-10-13T04:00:00Z'),
      payload: {
        messageID: 'k3vq8m2xpa',
        from: 'conversation',
        to: 'memory-writer',
        kind: 'request',
        replyTo: null,
        onBehalfOf: [],
        hop: 21,
        hopLimit: 20,
        wake: true,
        woke: false,
        source: 'task:conversation',
      },
      erasable: { status: 'readable', fields: { body: 'Skip the bike note.' } },
    }),
    buildMockLogRecord({ kind: 'task.wake', thread: 'memory-writer', payload: {} }),
  ];

  const prompt = renderSessionMessages(
    records,
    { defaultZone: 'UTC', now: new Date('2026-10-13T05:00:00Z') },
    buildMockTaskMessageView({ wake: { hop: 0, cause: { kind: 'event' } } }),
  );

  expect(prompt).toMatch(
    /^<system-message type="task-messages"[^>]+>\n1 message from Conversation arrived after the exchange reached its limit, so it did not wake you\. You woke for an outside event, so a reply from you will wake Conversation\.\n<\/system-message id="\w+">\n\n<task-message id="k3vq8m2xpa" [^>]+>\nThis message is from another task, not from the owner\.\nSkip the bike note\.\n<\/task-message block="\w+">$/u,
  );
});
