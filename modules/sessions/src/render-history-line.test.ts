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

test('it renders a marker line for each image of your message and none of its bytes', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/webp' }] },
    erasable: { status: 'readable', fields: { text: 'Two menu sketches.' } },
  });

  expect(
    renderHistoryLine(
      { record, answered: null },
      {
        defaultZone: 'Australia/Sydney',
        now: new Date('2026-10-13T05:00:00Z'),
      },
    ),
  ).toMatch(
    /^\[#48213 · Mon 12 Oct, 21:31, Sydney\] owner: Two menu sketches\.\n<dropped-image id="[0-9a-f]{12}" n="1"\/>\n<dropped-image id="[0-9a-f]{12}" n="2"\/>$/u,
  );
});

test('it renders no marker for the images of a forgotten message', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    payload: { images: [{ mediaType: 'image/png' }] },
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
  ).toBe('[#48213 · Mon 12 Oct, 21:31, Sydney] owner: [a message you sent, since forgotten]');
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

test("it renders a task's message framed as a task message, with its ID, its sender, its kind and the message it replies to", () => {
  const record = buildMockLogRecord({
    sequence: 48_300,
    kind: 'task_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'planner',
      to: 'conversation',
      kind: 'reply',
      replyTo: 'w7tn4c9rhz',
      onBehalfOf: ['48212'],
      hop: 2,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:planner',
    },
    erasable: { status: 'readable', fields: { body: 'Thursday suits the dentist.' } },
  });

  const line = renderHistoryLine(
    { record, answered: null },
    {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    },
  );

  const blockID = /block="(?<blockID>\w+)"/u.exec(line)?.groups?.['blockID'];

  expect(line).toBe(
    [
      '[#48300 · Mon 12 Oct, 21:31, Sydney] task planner:',
      `<task-message id="k3vq8m2xpa" from="planner" kind="reply" reply-to="w7tn4c9rhz" on-behalf-of="#48212" block="${blockID}">`,
      'This message is from another task, not from the owner.',
      'Thursday suits the dentist.',
      `</task-message block="${blockID}">`,
    ].join('\n'),
  );
});

test("it renders a forgotten task message's body as forgotten", () => {
  const record = buildMockLogRecord({
    sequence: 48_300,
    kind: 'task_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'planner',
      to: 'conversation',
      kind: 'chat',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:planner',
    },
    erasable: { status: 'shredded' },
  });

  expect(
    renderHistoryLine(
      { record, answered: null },
      { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    ),
  ).toInclude('\n[a message since forgotten]\n</task-message block="');
});
