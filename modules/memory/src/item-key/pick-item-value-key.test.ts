import { expect, test } from 'bun:test';
import { pickItemValueKey } from './pick-item-value-key';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it answers removed when a mark appeared after the key was read, though the key is gone', () => {
  const picked = pickItemValueKey({
    resolution: { kind: 'resolved', keyID: 'item-1', isRemoved: false },
    isRemovedAfter: true,
    keys: new Map(),
  });

  expect(picked).toStrictEqual({ status: 'removed' });
});

test('it answers shredded when the key is gone and no mark came', () => {
  const picked = pickItemValueKey({
    resolution: { kind: 'resolved', keyID: 'item-1', isRemoved: false },
    isRemovedAfter: false,
    keys: new Map(),
  });

  expect(picked).toStrictEqual({ status: 'shredded' });
});

test('it answers unreadable when the key does not unwrap', () => {
  const picked = pickItemValueKey({
    resolution: { kind: 'resolved', keyID: 'item-1', isRemoved: false },
    isRemovedAfter: false,
    keys: new Map([['item-1', null]]),
  });

  expect(picked).toStrictEqual({ status: 'unreadable' });
});

test('it answers unreadable for a value that has no key row', () => {
  const picked = pickItemValueKey({
    resolution: { kind: 'unresolved' },
    isRemovedAfter: false,
    keys: new Map(),
  });

  expect(picked).toStrictEqual({ status: 'unreadable' });
});

test('it answers shredded for a quote whose record has no key', async () => {
  const ctx = await setupTest();

  const picked = pickItemValueKey({
    resolution: {
      kind: 'resolved',
      keyID: 'item-1/version-1',
      recordKeyID: 'record-9',
      isRemoved: false,
    },
    isRemovedAfter: false,
    keys: new Map([['item-1/version-1', ctx.key]]),
  });

  expect(picked).toStrictEqual({ status: 'shredded' });
});

test('it answers both keys for a quote', async () => {
  const ctx = await setupTest();

  const picked = pickItemValueKey({
    resolution: {
      kind: 'resolved',
      keyID: 'item-1/version-1',
      recordKeyID: 'record-9',
      isRemoved: false,
    },
    isRemovedAfter: false,
    keys: new Map([
      ['item-1/version-1', ctx.key],
      ['record-9', ctx.key],
    ]),
  });

  expect(picked).toStrictEqual({
    status: 'readable',
    keyID: 'item-1/version-1',
    key: ctx.key,
    recordKey: ctx.key,
  });
});
