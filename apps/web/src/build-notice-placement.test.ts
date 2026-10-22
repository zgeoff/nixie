import { expect, test } from 'bun:test';
import { buildNoticePlacement } from './build-notice-placement';
import { buildMockLogRecord } from './test-utils/build-mock-log-record';
import { buildMockMemoryNoticeEntry } from './test-utils/build-mock-memory-notice-entry';
import { buildMockStepActivity } from './test-utils/build-mock-step-activity';

test("it places a turn's notice after the turn's reply, before your next message", () => {
  const notice = {
    entries: [buildMockMemoryNoticeEntry({ sequence: 3 })],
    kind: 'turn',
    messageSequence: 1,
    noticeKey: `turn/conversation/${String(1)}`,
    proposed: 0,
    remembered: 1,
    retired: 0,
  } as const;

  const placement = buildNoticePlacement(
    [
      { kind: 'message', record: buildMockLogRecord({ kind: 'owner_message', sequence: 1 }) },
      buildMockStepActivity({ key: 2 }),
      { kind: 'message', record: buildMockLogRecord({ kind: 'model.reply', sequence: 5 }) },
      { kind: 'message', record: buildMockLogRecord({ kind: 'owner_message', sequence: 7 }) },
    ],
    [notice],
  );

  expect([...placement]).toStrictEqual([[2, [notice]]]);
});

test("it places the newest turn's notice after the last item", () => {
  const notice = {
    entries: [buildMockMemoryNoticeEntry({ sequence: 3 })],
    kind: 'turn',
    messageSequence: 1,
    noticeKey: `turn/conversation/${String(1)}`,
    proposed: 0,
    remembered: 1,
    retired: 0,
  } as const;

  const placement = buildNoticePlacement(
    [
      { kind: 'message', record: buildMockLogRecord({ kind: 'owner_message', sequence: 1 }) },
      { kind: 'message', record: buildMockLogRecord({ kind: 'model.reply', sequence: 5 }) },
    ],
    [notice],
  );

  expect([...placement]).toStrictEqual([[1, [notice]]]);
});

test("it places a batch's notice after the last item before its newest write", () => {
  const notice = {
    entries: [
      buildMockMemoryNoticeEntry({ sequence: 6 }),
      buildMockMemoryNoticeEntry({ sequence: 9 }),
    ],
    kind: 'batch',
    messageSequence: null,
    noticeKey: 'batch/4c1e',
    proposed: 0,
    remembered: 2,
    retired: 0,
  } as const;

  const placement = buildNoticePlacement(
    [
      { kind: 'message', record: buildMockLogRecord({ kind: 'owner_message', sequence: 1 }) },
      { kind: 'message', record: buildMockLogRecord({ kind: 'model.reply', sequence: 5 }) },
      { kind: 'message', record: buildMockLogRecord({ kind: 'owner_message', sequence: 12 }) },
    ],
    [notice],
  );

  expect([...placement]).toStrictEqual([[1, [notice]]]);
});

test('it leaves out a notice older than every item shown', () => {
  const notice = {
    entries: [buildMockMemoryNoticeEntry({ sequence: 4 })],
    kind: 'batch',
    messageSequence: null,
    noticeKey: 'batch/4c1e',
    proposed: 0,
    remembered: 1,
    retired: 0,
  } as const;

  const placement = buildNoticePlacement(
    [{ kind: 'message', record: buildMockLogRecord({ kind: 'owner_message', sequence: 20 }) }],
    [notice],
  );

  expect(placement.size).toBe(0);
});
