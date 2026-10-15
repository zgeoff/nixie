import { expect, test } from 'bun:test';
import { decodeConsolidationSummary } from './decode-consolidation-summary';
import { encodeConsolidationSummary } from './encode-consolidation-summary';

async function setupTest() {
  const itemIDs = ['item-a', 'item-b'];

  const generated = await Promise.all(
    itemIDs.map(() =>
      crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    ),
  );

  const keys = new Map(generated.map((key, index) => [itemIDs[index] ?? '', key] as const));

  const sealed = await encodeConsolidationSummary('diff-1', 'Two items about tea conflict.', keys);

  return { keys, sealed };
}

test('it rejects a summary sealed for another run', async () => {
  const ctx = await setupTest();

  expect(decodeConsolidationSummary('diff-2', ctx.sealed, ctx.keys)).rejects.toThrow();
});

test("it rejects a share opened under another item's key", async () => {
  const ctx = await setupTest();

  const [first, second] = ctx.sealed.shares;

  const swapped = {
    ...ctx.sealed,
    shares: [
      { itemID: 'item-a', sealed: second?.sealed ?? '' },
      { itemID: 'item-b', sealed: first?.sealed ?? '' },
    ],
  };

  expect(decodeConsolidationSummary('diff-1', swapped, ctx.keys)).rejects.toThrow();
});

test('it rejects a summary with a share left out, because every share builds the key', async () => {
  const ctx = await setupTest();

  const short = { ...ctx.sealed, shares: ctx.sealed.shares.slice(0, 1) };

  expect(decodeConsolidationSummary('diff-1', short, ctx.keys)).rejects.toThrow();
});
