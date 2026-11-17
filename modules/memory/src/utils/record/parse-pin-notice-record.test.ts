import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { parsePinNoticeRecord } from './parse-pin-notice-record';

test('it reads a pin notice record into its typed shape', () => {
  const record = buildMockLogRecord({
    kind: 'memory.pin_noticed',
    payload: { itemID: 'item-a', isPinned: false, noticeKey: 'run/run-4' },
  });

  expect(parsePinNoticeRecord(record)).toStrictEqual({
    kind: 'memory.pin_noticed',
    itemID: 'item-a',
    isPinned: false,
    noticeKey: 'run/run-4',
  });
});

test('it gives null for a pinned record, which the release before reads with no notice key', () => {
  const record = buildMockLogRecord({
    kind: 'memory.pinned',
    payload: { itemID: 'item-a', isPinned: true },
  });

  expect(parsePinNoticeRecord(record)).toBeNull();
});
