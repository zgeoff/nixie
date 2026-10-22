import { expect, test } from 'bun:test';
import { readMockConsolidatorStatus } from './read-mock-consolidator-status';
import { store } from './store';

test('it reads the consolidator as on when the store holds no status', () => {
  expect(readMockConsolidatorStatus()).toStrictEqual({ isEnabled: true });
});

test('it reads the status the store holds', async () => {
  await store.memoryConsolidator.create({ isEnabled: false });

  expect(readMockConsolidatorStatus()).toStrictEqual({ isEnabled: false });
});
