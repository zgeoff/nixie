import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { inboxBatchLimit } from './inbox-batch-limit';
import { pickTurnInbox } from './pick-turn-inbox';
import { buildMockTaskMessageRecord } from './test-utils/build-mock-task-message-record';

test('it cuts the batch after an unread brief, so a message behind it waits for the next turn', () => {
  const brief = buildMockTaskMessageRecord(10, 0);
  const behind = [buildMockLogRecord({ sequence: 11, kind: 'owner_message', thread: 't4m2' })];

  expect(pickTurnInbox([brief, ...behind])).toStrictEqual([brief]);
});

test('it keeps every record of a batch that holds no brief, up to the batch limit', () => {
  const inbox = Array.from({ length: inboxBatchLimit + 5 }, (_, index) =>
    buildMockTaskMessageRecord(index + 1, 1),
  );

  expect(pickTurnInbox(inbox)).toStrictEqual(inbox.slice(0, inboxBatchLimit));
});

test('it applies the batch limit to the records before a brief', () => {
  const before = Array.from({ length: inboxBatchLimit + 2 }, (_, index) =>
    buildMockTaskMessageRecord(index + 1, 1),
  );

  expect(pickTurnInbox([...before, buildMockTaskMessageRecord(900, 0)])).toStrictEqual(
    before.slice(0, inboxBatchLimit),
  );
});
