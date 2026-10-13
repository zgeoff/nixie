import { expect, test } from 'bun:test';
import { readMemoryVersion } from './read-memory-version';
import { store } from './store';

test('it reads a readable version with its text', async () => {
  await store.memoryVersions.create({ itemID: 'item-a', text: 'Stub memory', version: 2 });

  expect(readMemoryVersion({ itemID: 'item-a', version: 2 })).toStrictEqual({
    itemID: 'item-a',
    status: 'readable',
    text: 'Stub memory',
    version: 2,
  });
});

test('it reads a shredded version with no text', async () => {
  await store.memoryVersions.create({
    itemID: 'item-a',
    status: 'shredded',
    text: 'Stub memory',
    version: 1,
  });

  expect(readMemoryVersion({ itemID: 'item-a', version: 1 })).toStrictEqual({
    itemID: 'item-a',
    status: 'shredded',
    version: 1,
  });
});

test('it reads a version the store lacks as missing', async () => {
  await store.memoryVersions.create({ itemID: 'item-a', text: 'Stub memory', version: 1 });

  expect(readMemoryVersion({ itemID: 'item-a', version: 2 })).toStrictEqual({
    itemID: 'item-a',
    status: 'missing',
    version: 2,
  });
});
