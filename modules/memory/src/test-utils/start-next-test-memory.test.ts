import { expect, test } from 'bun:test';
import { startNextTestMemory } from './start-next-test-memory';
import { startTestMemory } from './start-test-memory';

test('it starts the next writer and store on the same data directory', async () => {
  const first = await startTestMemory();
  const next = await startNextTestMemory(first);

  expect(next.dataDir).toBe(first.dataDir);
  expect(next.writer.epoch).toBe(first.writer.epoch + 1);
});

test('it passes the session cleanup to the next store', async () => {
  const first = await startTestMemory();

  const cleaned: string[] = [];

  const next = await startNextTestMemory(first, {
    cleanupSessions: (cause) => {
      cleaned.push(cause.itemID);

      return Promise.resolve();
    },
  });

  const item = await next.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await next.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  expect(cleaned).toStrictEqual([item.itemID]);
});
