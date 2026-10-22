import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockRetiredForget } from './write-mock-retired-forget';

test('it forgets every retired target and reports each one deleted', async () => {
  const [first, second] = await Promise.all([
    store.memoryItems.create({ state: 'retired', versions: [{ text: 'Owns a red canoe' }] }),
    store.memoryItems.create({ state: 'retired', versions: [{ text: 'Plays the oboe badly' }] }),
  ]);

  const result = await writeMockRetiredForget({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [
      { itemID: first.itemID, version: 1 },
      { itemID: second.itemID, version: 1 },
    ],
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: second.itemID }));

  expect(result).toStrictEqual({
    status: 'applied',
    forgets: { deleted: [first.itemID, second.itemID], pending: [] },
  });

  expect(stored).toMatchObject({ forgottenAt: expect.toBeValidDate(), state: 'forgotten' });
});

test('it refuses the whole set for a target at an old version, and forgets nothing', async () => {
  const [first, second] = await Promise.all([
    store.memoryItems.create({ state: 'retired', versions: [{ text: 'Owns a red canoe' }] }),
    store.memoryItems.create({
      versions: [{ text: 'Plays the oboe badly' }, { change: 'restored', text: 'Plays the oboe' }],
    }),
  ]);

  const result = await writeMockRetiredForget({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [
      { itemID: first.itemID, version: 1 },
      { itemID: second.itemID, version: 1 },
    ],
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: first.itemID }));

  expect(result).toStrictEqual({ status: 'stale' });
  expect(stored?.state).toBe('retired');
});

test('it refuses an active target at its version', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Owns a red canoe' }] });

  const result = await writeMockRetiredForget({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [{ itemID: item.itemID, version: 1 }],
  });

  expect(result).toStrictEqual({ status: 'wrong_state' });
});

test('it refuses a target a forget began', async () => {
  const item = await store.memoryItems.create({
    state: 'forgetting',
    versions: [{ text: 'Owns a red canoe' }],
  });

  const result = await writeMockRetiredForget({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [{ itemID: item.itemID, version: 1 }],
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test('it refuses an ID another action used', async () => {
  const [first, second] = await Promise.all([
    store.memoryItems.create({ state: 'retired', versions: [{ text: 'Owns a red canoe' }] }),
    store.memoryItems.create({ state: 'retired', versions: [{ text: 'Plays the oboe badly' }] }),
  ]);

  await writeMockRetiredForget({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [{ itemID: first.itemID, version: 1 }],
  });

  const result = await writeMockRetiredForget({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [{ itemID: second.itemID, version: 1 }],
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it stops at a failed cleanup with the later items pending, and finishes them on the retry', async () => {
  const [first, second] = await Promise.all([
    store.memoryItems.create({ state: 'retired', versions: [{ text: 'Owns a red canoe' }] }),
    store.memoryItems.create({
      failsForgetCleanup: true,
      state: 'retired',
      versions: [{ text: 'Plays the oboe badly' }],
    }),
  ]);

  const input = {
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [
      { itemID: first.itemID, version: 1 },
      { itemID: second.itemID, version: 1 },
    ],
  };

  const failed = await writeMockRetiredForget(input);

  const pending = store.memoryItems.findFirst((query) => query.where({ itemID: second.itemID }));

  const retried = await writeMockRetiredForget(input);

  expect(failed).toStrictEqual({ status: 'cleanup_failed' });
  expect(pending?.state).toBe('forgetting');

  expect(retried).toStrictEqual({
    status: 'applied',
    forgets: { deleted: [first.itemID, second.itemID], pending: [] },
  });
});
