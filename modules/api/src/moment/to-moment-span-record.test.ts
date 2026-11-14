import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { toMomentSpanRecord } from './to-moment-span-record';

test('it carries the text of your message', () => {
  const record = buildMockLogRecord({
    sequence: 4,
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    kind: 'owner_message',
    thread: 'conversation',
    erasable: { status: 'readable', fields: { text: 'the gate squeaks again' } },
  });

  expect(toMomentSpanRecord(record, new Set())).toStrictEqual({
    isGap: false,
    isRemoved: false,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 4,
    text: 'the gate squeaks again',
    tool: null,
  });
});

test('it carries the tool of a call and none of its input', () => {
  const record = buildMockLogRecord({
    sequence: 5,
    recordedAt: new Date('2026-10-10T12:00:01Z'),
    kind: 'tool_called',
    thread: 'conversation',
    payload: { callID: 'call-1', runID: 'run-1', tool: 'web_fetch', toolUseID: 'use-1' },
    erasable: { status: 'readable', fields: { input: { url: 'https://example.com/' } } },
  });

  expect(toMomentSpanRecord(record, new Set())).toStrictEqual({
    isGap: false,
    isRemoved: false,
    kind: 'tool_called',
    recordedAt: new Date('2026-10-10T12:00:01Z'),
    sequence: 5,
    text: null,
    tool: 'web_fetch',
  });
});

test.each([['shredded' as const], ['unreadable' as const]])(
  'it marks a record whose text is %s as a gap',
  (status) => {
    const record = buildMockLogRecord({
      sequence: 6,
      recordedAt: new Date('2026-10-10T12:00:02Z'),
      kind: 'model.reply',
      thread: 'conversation',
      erasable: { status },
    });

    expect(toMomentSpanRecord(record, new Set())).toStrictEqual({
      isGap: true,
      isRemoved: false,
      kind: 'model.reply',
      recordedAt: new Date('2026-10-10T12:00:02Z'),
      sequence: 6,
      text: null,
      tool: null,
    });
  },
);

test('it marks a record that never held text as no gap', () => {
  const record = buildMockLogRecord({
    sequence: 7,
    recordedAt: new Date('2026-10-10T12:00:03Z'),
    kind: 'task.wake',
    thread: 'conversation',
    erasable: { status: 'none' },
  });

  expect(toMomentSpanRecord(record, new Set()).isGap).toBe(false);
});

test('it marks a shredded record that a forget named as removed, and keeps it a gap', () => {
  const record = buildMockLogRecord({
    sequence: 8,
    recordedAt: new Date('2026-10-10T12:00:04Z'),
    kind: 'model.reply',
    thread: 'conversation',
    erasable: { status: 'shredded' },
  });

  const read = toMomentSpanRecord(record, new Set([8]));

  expect([read.isGap, read.isRemoved]).toStrictEqual([true, true]);
});

test('it leaves an unreadable record unmarked even when a forget named it', () => {
  const record = buildMockLogRecord({
    sequence: 9,
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    kind: 'model.reply',
    thread: 'conversation',
    erasable: { status: 'unreadable' },
  });

  const read = toMomentSpanRecord(record, new Set([9]));

  expect([read.isGap, read.isRemoved]).toStrictEqual([true, false]);
});
