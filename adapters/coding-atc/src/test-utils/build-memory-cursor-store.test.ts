import { expect, test } from 'bun:test';
import { buildMemoryCursorStore } from './build-memory-cursor-store';

test('it reads the first cursor written under a key', async () => {
  const store = buildMemoryCursorStore();

  await store.write('action-1', 'g0');
  await store.write('action-1', 'g4');

  const cursor = await store.read('action-1');

  expect(cursor).toBe('g0');
});

test('it reads null for a key it never saw or removed', async () => {
  const store = buildMemoryCursorStore();

  await store.write('action-1', 'g0');
  await store.remove('action-1');

  const cursors = [await store.read('action-1'), await store.read('action-2')];

  expect(cursors).toStrictEqual([null, null]);
});
