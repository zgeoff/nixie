import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderHistoryLine } from './render-history-line';

test('it renders your message with the time you sent it, in the zone the message carries', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    payload: { timeZone: 'Asia/Tokyo' },
    erasable: { status: 'readable', fields: { text: 'Where is the spare key?' } },
  });

  expect(
    renderHistoryLine(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('[Mon 12 Oct, 19:31, Tokyo] owner: Where is the spare key?');
});

test('it renders your message with the time you sent it, in the default zone when the message carries none', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    erasable: { status: 'readable', fields: { text: 'Where is the spare key?' } },
  });

  expect(
    renderHistoryLine(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('[Mon 12 Oct, 21:31, Sydney] owner: Where is the spare key?');
});

test('it renders a reply as nixie with its time in UTC', () => {
  const record = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-12T10:32:00Z'),
    erasable: { status: 'readable', fields: { text: 'Under the blue flowerpot.' } },
  });

  expect(
    renderHistoryLine(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('[2026-10-12 10:32 UTC] nixie: Under the blue flowerpot.');
});

test('it renders a note in place of a reply whose text was forgotten', () => {
  const record = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-12T10:32:00Z'),
    erasable: { status: 'shredded' },
  });

  expect(
    renderHistoryLine(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('[2026-10-12 10:32 UTC] nixie: [a reply, since forgotten]');
});
