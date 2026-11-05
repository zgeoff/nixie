import { expect, test } from 'bun:test';
import { collectPreviousPinned } from './collect-previous-pinned.ts';

test('it gives each turn the pinned core of the latest conversation turn that ended before its step', () => {
  const ended = (sequence: number, thread: string, pinnedCore: { itemID: string; version: number }[] | null) => ({
    sequence,
    recordedAt: '2026-03-02T08:00:00Z',
    kind: 'model.turn_ended',
    thread,
    parent: null,
    payload: { pinnedCore },
    erasable: { status: 'none' as const },
  });

  expect(
    collectPreviousPinned(
      [
        { stepSequence: 10, isSessionStart: true },
        { stepSequence: 30, isSessionStart: false },
        { stepSequence: 50, isSessionStart: false },
      ],
      [
        ended(12, 'conversation', [{ itemID: 'item-a', version: 1 }]),
        ended(20, 'conversation', [{ itemID: 'item-a', version: 2 }]),
        ended(25, 'task-7', [{ itemID: 'item-b', version: 1 }]),
        ended(40, 'conversation', null),
      ],
    ),
  ).toStrictEqual([null, [{ itemID: 'item-a', version: 2 }], null]);
});
