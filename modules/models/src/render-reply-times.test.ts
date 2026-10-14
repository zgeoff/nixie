import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderReplyTimes } from './render-reply-times';

test('it renders each reply with the time it was sent, in the zone of the message it answers', () => {
  const answered = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-14T03:05:00Z'),
    payload: { timeZone: 'Australia/Sydney' },
    erasable: { status: 'readable', fields: { text: 'Did the parcel come?' } },
  });
  const first = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-14T03:06:00Z'),
    erasable: { status: 'readable', fields: { text: 'It came at noon.' } },
  });
  const second = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-14T03:07:00Z'),
    erasable: { status: 'readable', fields: { text: 'It is on the porch.' } },
  });

  expect(
    renderReplyTimes(
      [
        { record: first, answered },
        { record: second, answered },
      ],
      { defaultZone: 'Asia/Tokyo', now: new Date('2026-10-14T05:00:00Z') },
    ),
  ).toBe(
    [
      '<reply-times>',
      'Your replies in your last turn, each with the time it was sent:',
      '[Wed 14 Oct, 14:06, Sydney] It came at noon.',
      '[Wed 14 Oct, 14:07, Sydney] It is on the porch.',
      '</reply-times>',
    ].join('\n'),
  );
});

test('it renders a reply in the default zone when it answers no message', () => {
  const record = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-14T03:06:00Z'),
    erasable: { status: 'readable', fields: { text: 'Good morning.' } },
  });

  expect(
    renderReplyTimes([{ record, answered: null }], {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toInclude('\n[Wed 14 Oct, 14:06, Sydney] Good morning.\n');
});

test('it renders a long reply by its first 8 words, on one line', () => {
  const record = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-14T03:06:00Z'),
    erasable: {
      status: 'readable',
      fields: { text: 'The parcel came at noon,\nand the courier left it on the porch.' },
    },
  });

  expect(
    renderReplyTimes([{ record, answered: null }], {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toInclude('\n[Wed 14 Oct, 14:06, Sydney] The parcel came at noon, and the courier …\n');
});

test('it renders a note in place of a reply whose text was forgotten', () => {
  const record = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-14T03:06:00Z'),
    erasable: { status: 'shredded' },
  });

  expect(
    renderReplyTimes([{ record, answered: null }], {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toInclude('\n[Wed 14 Oct, 14:06, Sydney] [a reply, since forgotten]\n');
});

test('it renders a reply from a past year with its year', () => {
  const record = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2025-10-14T03:06:00Z'),
    erasable: { status: 'readable', fields: { text: 'Good morning.' } },
  });

  expect(
    renderReplyTimes([{ record, answered: null }], {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toInclude('\n[Tue 14 Oct 2025, 14:06, Sydney] Good morning.\n');
});

test('it renders nothing for a turn with no reply', () => {
  expect(
    renderReplyTimes([], {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T05:00:00Z'),
    }),
  ).toBeNull();
});
