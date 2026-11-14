import { expect, test } from 'bun:test';
import { planBatchSplit } from './plan-batch-split';

test('it ends the first half before your middle message', () => {
  const half = planBatchSplit({ start: 0, end: 4 }, [
    { sequence: 1, isOwner: true },
    { sequence: 2, isOwner: false },
    { sequence: 3, isOwner: true },
    { sequence: 4, isOwner: false },
  ]);

  expect(half).toStrictEqual({ start: 0, end: 2 });
});

test('it splits an odd count of your messages before the one past the middle', () => {
  const half = planBatchSplit({ start: 10, end: 16 }, [
    { sequence: 11, isOwner: true },
    { sequence: 12, isOwner: false },
    { sequence: 13, isOwner: true },
    { sequence: 14, isOwner: false },
    { sequence: 15, isOwner: true },
    { sequence: 16, isOwner: false },
  ]);

  expect(half).toStrictEqual({ start: 10, end: 12 });
});

test('it splits between two of your messages with no reply between them', () => {
  const half = planBatchSplit({ start: 0, end: 2 }, [
    { sequence: 1, isOwner: true },
    { sequence: 2, isOwner: true },
  ]);

  expect(half).toStrictEqual({ start: 0, end: 1 });
});

test('it cannot split a batch with one of your messages', () => {
  const half = planBatchSplit({ start: 0, end: 3 }, [
    { sequence: 1, isOwner: true },
    { sequence: 2, isOwner: false },
    { sequence: 3, isOwner: false },
  ]);

  expect(half).toBeNull();
});

test('it cannot split a batch with none of your messages', () => {
  const half = planBatchSplit({ start: 0, end: 1 }, [{ sequence: 1, isOwner: false }]);

  expect(half).toBeNull();
});
