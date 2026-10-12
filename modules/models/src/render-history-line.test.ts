import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderHistoryLine } from './render-history-line';

test('it renders your message with its time', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    erasable: { status: 'readable', fields: { text: 'Where is the spare key?' } },
  });

  expect(renderHistoryLine(record)).toBe('[2026-10-12 10:31] owner: Where is the spare key?');
});

test('it renders a reply as nixie with its time', () => {
  const record = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-12T10:32:00Z'),
    erasable: { status: 'readable', fields: { text: 'Under the blue flowerpot.' } },
  });

  expect(renderHistoryLine(record)).toBe('[2026-10-12 10:32] nixie: Under the blue flowerpot.');
});

test('it renders a note in place of a reply whose text was forgotten', () => {
  const record = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-12T10:32:00Z'),
    erasable: { status: 'shredded' },
  });

  expect(renderHistoryLine(record)).toBe('[2026-10-12 10:32] nixie: [a reply, since forgotten]');
});
