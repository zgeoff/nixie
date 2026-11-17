import { expect, test } from 'bun:test';
import { readPurgeSet } from '@heynixie/memory';
import { seedQuotedMemoryItems } from './seed-quoted-memory-items';
import { startTestAPI } from './start-test-api';
import { startTestMemoryForgets } from './start-test-memory-forgets';

async function setupTest() {
  const api = await startTestAPI();
  const forgets = await startTestMemoryForgets(api.context);

  return { api, ...forgets };
}

test('it seeds an item of 2 versions that quotes the message, and another that quotes a later message', async () => {
  const ctx = await setupTest();
  const seeded = await seedQuotedMemoryItems(ctx.api.context, ctx.memory);

  const set = await readPurgeSet(ctx.api.context.log.writer.db, seeded.sequence, [
    'active',
    'retired',
  ]);

  expect(set).toStrictEqual([seeded.quoting.itemID]);
  expect(seeded.quoting.version).toBe(2);
  expect(seeded.unrelated.itemID).not.toBe(seeded.quoting.itemID);
});
