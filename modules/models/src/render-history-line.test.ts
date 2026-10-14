import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderHistoryLine } from './render-history-line';

test('it renders your message with its event ID and the time you sent it, in the zone the message carries', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    payload: { timeZone: 'Asia/Tokyo' },
    erasable: { status: 'readable', fields: { text: 'Where is the spare key?' } },
  });

  expect(
    renderHistoryLine(
      { record, answered: null },
      {
        defaultZone: 'Australia/Sydney',
        now: new Date('2026-10-13T05:00:00Z'),
      },
    ),
  ).toBe('[#48213 · Mon 12 Oct, 19:31, Tokyo] owner: Where is the spare key?');
});

test('it renders your message with its event ID and the time you sent it, in the default zone when the message carries none', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    erasable: { status: 'readable', fields: { text: 'Where is the spare key?' } },
  });

  expect(
    renderHistoryLine(
      { record, answered: null },
      {
        defaultZone: 'Australia/Sydney',
        now: new Date('2026-10-13T05:00:00Z'),
      },
    ),
  ).toBe('[#48213 · Mon 12 Oct, 21:31, Sydney] owner: Where is the spare key?');
});

test('it renders your message with the label of the session you sent it from', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    erasable: {
      status: 'readable',
      fields: { text: 'Where is the spare key?', sessionLabel: 'phone' },
    },
  });

  expect(
    renderHistoryLine(
      { record, answered: null },
      {
        defaultZone: 'Australia/Sydney',
        now: new Date('2026-10-13T05:00:00Z'),
      },
    ),
  ).toBe('[#48213 · Mon 12 Oct, 21:31, Sydney · phone] owner: Where is the spare key?');
});

test('it renders a reply as nixie with its own event ID and its time in the zone of the message it answers', () => {
  const answered = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2025-10-14T03:05:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'Where is the spare key?' } },
  });
  const record = buildMockLogRecord({
    sequence: 48_214,
    kind: 'model.reply',
    recordedAt: new Date('2025-10-14T03:06:00Z'),
    erasable: { status: 'readable', fields: { text: 'Under the blue flowerpot.' } },
  });

  expect(
    renderHistoryLine(
      { record, answered },
      { defaultZone: 'Asia/Tokyo', now: new Date('2025-10-14T05:00:00Z') },
    ),
  ).toBe('[#48214 · Tue 14 Oct, 14:06, Sydney] nixie: Under the blue flowerpot.');
});

test('it renders a reply as nixie with its time in the default zone when it answers no message', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'model.reply',
    recordedAt: new Date('2025-10-14T03:06:00Z'),
    erasable: { status: 'readable', fields: { text: 'Under the blue flowerpot.' } },
  });

  expect(
    renderHistoryLine(
      { record, answered: null },
      { defaultZone: 'Australia/Sydney', now: new Date('2025-10-14T05:00:00Z') },
    ),
  ).toBe('[#48213 · Tue 14 Oct, 14:06, Sydney] nixie: Under the blue flowerpot.');
});

test('it renders a reply in the default zone when the message it answers carries no zone', () => {
  const answered = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2025-10-14T03:05:00Z'),
    erasable: { status: 'readable', fields: { text: 'Where is the spare key?' } },
  });
  const record = buildMockLogRecord({
    sequence: 48_214,
    kind: 'model.reply',
    recordedAt: new Date('2025-10-14T03:06:00Z'),
    erasable: { status: 'readable', fields: { text: 'Under the blue flowerpot.' } },
  });

  expect(
    renderHistoryLine(
      { record, answered },
      { defaultZone: 'Australia/Sydney', now: new Date('2025-10-14T05:00:00Z') },
    ),
  ).toBe('[#48214 · Tue 14 Oct, 14:06, Sydney] nixie: Under the blue flowerpot.');
});

test('it renders a reply from a past year with its year', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'model.reply',
    recordedAt: new Date('2025-10-14T03:06:00Z'),
    erasable: { status: 'readable', fields: { text: 'Under the blue flowerpot.' } },
  });

  expect(
    renderHistoryLine(
      { record, answered: null },
      { defaultZone: 'Australia/Sydney', now: new Date('2026-10-14T05:00:00Z') },
    ),
  ).toBe('[#48213 · Tue 14 Oct 2025, 14:06, Sydney] nixie: Under the blue flowerpot.');
});

test('it renders a note in place of a reply whose text was forgotten', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'model.reply',
    recordedAt: new Date('2026-10-12T10:32:00Z'),
    erasable: { status: 'shredded' },
  });

  expect(
    renderHistoryLine(
      { record, answered: null },
      {
        defaultZone: 'Australia/Sydney',
        now: new Date('2026-10-13T05:00:00Z'),
      },
    ),
  ).toBe('[#48213 · Mon 12 Oct, 21:32, Sydney] nixie: [a reply, since forgotten]');
});

test('it renders a span you pasted in your message inside a pasted block', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    payload: { timeZone: 'Asia/Tokyo' },
    erasable: {
      status: 'readable',
      fields: {
        text: 'See: Call Sam.',
        spans: [
          { start: 0, end: 5, source: 'typed' },
          { start: 5, end: 14, source: 'pasted' },
        ],
      },
    },
  });
  const line = renderHistoryLine(
    { record, answered: null },
    {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    },
  );
  const blockID = /<pasted id="(?<blockID>\w+)">/u.exec(line)?.groups?.['blockID'];

  expect(line).toBe(
    `[#48213 · Mon 12 Oct, 19:31, Tokyo] owner: See: <pasted id="${blockID}">Call Sam.</pasted id="${blockID}">`,
  );
});
