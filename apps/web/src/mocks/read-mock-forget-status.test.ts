import { expect, test } from 'bun:test';
import { readMockForgetStatus } from './read-mock-forget-status';
import { store } from './store';

test('it separates the forgotten items from the ones whose forget is pending, and leaves out the rest', async () => {
  const [forgotten, forgetting, retired] = await Promise.all([
    store.memoryItems.create({ state: 'forgotten', versions: [{ text: 'Owns a red canoe' }] }),
    store.memoryItems.create({ state: 'forgetting', versions: [{ text: 'Plays the oboe' }] }),
    store.memoryItems.create({ state: 'retired', versions: [{ text: 'Grows chillies' }] }),
  ]);

  const status = readMockForgetStatus([forgotten.itemID, forgetting.itemID, retired.itemID]);

  expect(status).toStrictEqual({ deleted: [forgotten.itemID], pending: [forgetting.itemID] });
});
