import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { formatMessageStamp } from './format-message-stamp';

test('it formats the event ID and the send time, then the label of the session the message came from', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-14T03:05:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'Buy milk.', sessionLabel: 'phone' } },
  });

  expect(
    formatMessageStamp(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toBe('#48213 · Wed 14 Oct, 14:05, Sydney · phone');
});

test('it formats only the event ID and the send time for a message that holds no label', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-14T03:05:00Z'),
    erasable: { status: 'readable', fields: { text: 'Buy milk.' } },
  });

  expect(
    formatMessageStamp(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toBe('#48213 · Wed 14 Oct, 14:05, Sydney');
});

test('it formats only the event ID and the send time for a message that was forgotten', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-14T03:05:00Z'),
    erasable: { status: 'shredded' },
  });

  expect(
    formatMessageStamp(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toBe('#48213 · Wed 14 Oct, 14:05, Sydney');
});

test('it formats only the event ID and the send time for a label of white space alone', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-14T03:05:00Z'),
    erasable: { status: 'readable', fields: { text: 'Buy milk.', sessionLabel: ' \n ' } },
  });

  expect(
    formatMessageStamp(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toBe('#48213 · Wed 14 Oct, 14:05, Sydney');
});

test('it keeps a label that holds a line break on the line of the send time', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-14T03:05:00Z'),
    erasable: { status: 'readable', fields: { text: 'Buy milk.', sessionLabel: 'work\n  PC ' } },
  });

  expect(
    formatMessageStamp(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toBe('#48213 · Wed 14 Oct, 14:05, Sydney · work PC');
});
