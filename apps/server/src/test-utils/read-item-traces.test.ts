import { expect, test } from 'bun:test';
import { createApprovedItems } from './create-approved-items';
import { createTestClient } from './create-test-client';
import { readItemTraces } from './read-item-traces';
import { sendClientMessage } from './send-client-message';
import { startInProcessNixie } from './start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  return { nixie };
}

test('it finds the key, the match and the session copy of an item a turn recalled', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx.nixie);

  // BM25 ranks nothing in an index of 1 or 2 items, so per-turn retrieval needs 3 to place one.
  const [item] = await createApprovedItems(ctx.nixie, api.client, [
    'The spare key sits under the blue flowerpot',
    'Allergic to hazelnuts',
    'Prefers window seats on trains',
  ]);

  ctx.nixie.guest.addReplies({ text: 'Under the flowerpot.' });

  await sendClientMessage(api.client, { text: 'Where is the spare key?' }, 'Under the flowerpot.');

  const traces = await readItemTraces(ctx.nixie, api.client, item);

  expect(traces).toMatchObject({
    hasKey: true,
    isMatched: true,
    sessionFiles: expect.toSatisfy((paths: readonly string[]) =>
      paths.some((path) => path.includes('/.claude/')),
    ),
  });
});

test('it finds no trace of an item that does not exist', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx.nixie);

  const traces = await readItemTraces(ctx.nixie, api.client, {
    itemID: 'b3c1f7e2-5a94-4d0e-8f6b-2c7d9e1a4b38',
    text: 'Keeps a kayak in the garage',
  });

  expect(traces).toStrictEqual({ hasKey: false, isMatched: false, sessionFiles: [] });
});
