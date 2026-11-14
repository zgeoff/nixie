import { expect, test } from 'bun:test';
import { MemoryItemNotFoundError, SelfNoteError, StaleVersionError } from '@heynixie/memory';
import { toMemoryChangeError } from './to-memory-change-error';

test('it turns a stale version into the declared STALE_VERSION', () => {
  const error = toMemoryChangeError(new StaleVersionError({ itemID: 'item-a', version: 1 }, 2), {
    MEMORY_ITEM_NOT_FOUND: () => new Error('missing'),
    STALE_VERSION: () => new Error('stale'),
    WRONG_STATE: () => new Error('wrong state'),
  });

  expect(error).toStrictEqual(new Error('stale'));
});

test("it turns the store's missing item into the declared MEMORY_ITEM_NOT_FOUND", () => {
  const error = toMemoryChangeError(new MemoryItemNotFoundError('item-a'), {
    MEMORY_ITEM_NOT_FOUND: () => new Error('missing'),
    STALE_VERSION: () => new Error('stale'),
    WRONG_STATE: () => new Error('wrong state'),
  });

  expect(error).toStrictEqual(new Error('missing'));
});

test("it turns a self-note's refusal into the declared WRONG_STATE", () => {
  const error = toMemoryChangeError(new SelfNoteError('a self-note is never pinned'), {
    MEMORY_ITEM_NOT_FOUND: () => new Error('missing'),
    STALE_VERSION: () => new Error('stale'),
    WRONG_STATE: () => new Error('wrong state'),
  });

  expect(error).toStrictEqual(new Error('wrong state'));
});

test('it leaves an error with a code the procedure does not declare as it is', () => {
  const full = Object.assign(new Error('full'), { code: 'PINNED_CORE_FULL' });

  const error = toMemoryChangeError(full, {
    MEMORY_ITEM_NOT_FOUND: () => new Error('missing'),
    STALE_VERSION: () => new Error('stale'),
    WRONG_STATE: () => new Error('wrong state'),
  });

  expect(error).toBe(full);
});

test('it leaves an error with no code as it is', () => {
  const failure = new Error('the disk is full');

  const error = toMemoryChangeError(failure, {
    MEMORY_ITEM_NOT_FOUND: () => new Error('missing'),
    STALE_VERSION: () => new Error('stale'),
    WRONG_STATE: () => new Error('wrong state'),
  });

  expect(error).toBe(failure);
});
