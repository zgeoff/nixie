import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderSessionHistory } from './render-session-history';

test('it renders nothing for a thread with no earlier turn', () => {
  expect(
    renderSessionHistory([], {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBeNull();
});

test('it renders the recent turns in order inside a labelled block, each message a night apart with its own time', () => {
  const goodnight = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T11:40:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'Goodnight.' } },
  });
  const reply = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-12T11:40:30Z'),
    erasable: { status: 'readable', fields: { text: 'Sleep well.' } },
  });
  const goodMorning = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T20:15:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'Good morning.' } },
  });

  expect(
    renderSessionHistory([goodnight, reply, goodMorning], {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-12T20:16:00Z'),
    }),
  ).toMatchInlineSnapshot(`
    "<conversation-history>
    This session was rebuilt from nixie records after the earlier one was lost. These are the most recent turns before the new message, oldest first, word for word; older turns are left out.
    [Mon 12 Oct, 22:40, Sydney] owner: Goodnight.
    [2026-10-12 11:40 UTC] nixie: Sleep well.
    [Tue 13 Oct, 07:15, Sydney] owner: Good morning.
    </conversation-history>"
  `);
});
