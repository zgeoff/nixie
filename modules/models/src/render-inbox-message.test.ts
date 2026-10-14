import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderInboxMessage } from './render-inbox-message';

test('it renders your message after its event ID and the time you sent it, in the zone the message carries', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
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
  ).toBe('[#48213 · Tue 13 Oct, 14:05, London] Buy milk.');
});

test('it renders your message after its event ID and the time you sent it, in the default zone when the message carries none', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    erasable: { status: 'readable', fields: { text: 'Buy milk.' } },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('[#48213 · Tue 13 Oct, 14:05, Sydney] Buy milk.');
});

test('it renders two messages a night apart each with its own event ID and time', () => {
  const goodnight = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T11:40:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'Goodnight.' } },
  });
  const goodMorning = buildMockLogRecord({
    sequence: 48_214,
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
    '[#48213 · Mon 12 Oct, 22:40, Sydney] Goodnight.',
    '[#48214 · Tue 13 Oct, 07:15, Sydney] Good morning.',
  ]);
});

test('it renders messages from two device sessions each with its session’s label beside the send time', () => {
  const fromPhone = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-14T03:05:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'On the train.', sessionLabel: 'phone' } },
  });
  const fromPC = buildMockLogRecord({
    sequence: 48_214,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-14T08:40:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'Back at my desk.', sessionLabel: 'PC' } },
  });

  expect(
    [fromPhone, fromPC].map((record) =>
      renderInboxMessage(record, {
        defaultZone: 'Australia/Sydney',
        now: new Date('2026-10-14T09:00:00Z'),
      }),
    ),
  ).toStrictEqual([
    '[#48213 · Wed 14 Oct, 14:05, Sydney · phone] On the train.',
    '[#48214 · Wed 14 Oct, 19:40, Sydney · PC] Back at my desk.',
  ]);
});

test('it renders a note after the send time in place of a message whose text was forgotten', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    erasable: { status: 'shredded' },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('[#48213 · Tue 13 Oct, 14:05, Sydney] [a message you sent, since forgotten]');
});

test('it renders a fired timer after its event ID and the time it fired, in the default zone', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'timer.fired',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: { timerID: 't-1', taskID: 'water-the-ferns' },
    erasable: { status: 'none' },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe(
    '[#48213 · Tue 13 Oct, 14:05, Sydney] A timer fired: {"timerID":"t-1","taskID":"water-the-ferns"}',
  );
});

test('it renders an action outcome after its event ID and the time it settled, in the default zone', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'action.outcome',
    recordedAt: new Date('2026-10-13T03:40:00Z'),
    payload: { actionID: 'a-1', status: 'succeeded' },
    erasable: { status: 'none' },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe(
    '[#48213 · Tue 13 Oct, 14:40, Sydney] An action settled: {"actionID":"a-1","status":"succeeded"}',
  );
});

test('it renders a fired timer from an earlier year with the year in its stamp', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'timer.fired',
    recordedAt: new Date('2025-12-30T22:00:00Z'),
    payload: { timerID: 't-2' },
    erasable: { status: 'none' },
  });

  expect(
    renderInboxMessage(record, {
      defaultZone: 'Europe/London',
      now: new Date('2026-01-02T09:00:00Z'),
    }),
  ).toBe('[#48213 · Tue 30 Dec 2025, 22:00, London] A timer fired: {"timerID":"t-2"}');
});

test('it renders a span you dropped in your message inside a dropped block', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
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
    `[#48213 · Tue 13 Oct, 14:05, London] Read <dropped id="${blockID}">notes.txt</dropped id="${blockID}">`,
  );
});
