import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderInboxMessage } from './render-inbox-message';

test('it renders your message after the time you sent it, in the zone the message carries', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-13T13:05:00Z'),
    payload: { timeZone: 'Europe/London' },
    erasable: { status: 'readable', fields: { text: 'Buy milk.' } },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T15:00:00Z'),
    }),
  ).toBe('[Tue 13 Oct, 14:05, London] Buy milk.');
});

test('it renders your message after the time you sent it, in the default zone when the message carries none', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    erasable: { status: 'readable', fields: { text: 'Buy milk.' } },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('[Tue 13 Oct, 14:05, Sydney] Buy milk.');
});

test('it renders two messages a night apart each with its own time', () => {
  const goodnight = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T11:40:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'Goodnight.' } },
  });
  const goodMorning = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T20:15:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'Good morning.' } },
  });

  expect(
    [goodnight, goodMorning].map((record) =>
      renderInboxMessage(record, {
        defaultZone: 'Australia/Sydney',
        now: new Date('2026-10-12T20:16:00Z'),
      }),
    ),
  ).toStrictEqual([
    '[Mon 12 Oct, 22:40, Sydney] Goodnight.',
    '[Tue 13 Oct, 07:15, Sydney] Good morning.',
  ]);
});

test('it renders a note after the send time in place of a message whose text was forgotten', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    erasable: { status: 'shredded' },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('[Tue 13 Oct, 14:05, Sydney] [a message you sent, since forgotten]');
});

test('it renders a fired timer', () => {
  const record = buildMockLogRecord({
    kind: 'timer.fired',
    payload: { timerID: 't-1' },
    erasable: { status: 'none' },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('A timer fired: {"timerID":"t-1"}');
});

test('it renders an action outcome', () => {
  const record = buildMockLogRecord({
    kind: 'action.outcome',
    payload: { actionID: 'a-1' },
    erasable: { status: 'none' },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('An action settled: {"actionID":"a-1"}');
});

test('it renders a span you dropped in your message inside a dropped block', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-13T13:05:00Z'),
    payload: { timeZone: 'Europe/London' },
    erasable: {
      status: 'readable',
      fields: {
        text: 'Read notes.txt',
        spans: [
          { start: 0, end: 5, source: 'typed' },
          { start: 5, end: 14, source: 'dropped' },
        ],
      },
    },
  });
  const message = renderInboxMessage(record, {
    defaultZone: 'Australia/Sydney',
    now: new Date('2026-10-13T15:00:00Z'),
  });
  const blockID = /<dropped id="(?<blockID>\w+)">/u.exec(message)?.groups?.['blockID'];

  expect(message).toBe(
    `[Tue 13 Oct, 14:05, London] Read <dropped id="${blockID}">notes.txt</dropped id="${blockID}">`,
  );
});
