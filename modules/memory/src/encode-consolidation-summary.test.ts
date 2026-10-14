import { expect, test } from 'bun:test';
import { decodeConsolidationSummary } from './decode-consolidation-summary';
import { encodeConsolidationSummary } from './encode-consolidation-summary';

async function setupTest() {
  const itemIDs = ['item-a', 'item-b', 'item-c'];
  const generated = await Promise.all(
    itemIDs.map(() =>
      crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    ),
  );
  const keys = new Map(generated.map((key, index) => [itemIDs[index] ?? '', key] as const));

  return { keys };
}

test('it seals a summary that opens with the key of every item it holds a share for', async () => {
  const ctx = await setupTest();

  const sealed = await encodeConsolidationSummary(
    'diff-1',
    'Two items about tea conflict.',
    ctx.keys,
  );

  const result = await decodeConsolidationSummary('diff-1', sealed, ctx.keys);

  expect(result).toBe('Two items about tea conflict.');
  expect(sealed.shares.map((share) => share.itemID)).toStrictEqual(['item-a', 'item-b', 'item-c']);
});

test('it writes base64 with no plain text in the summary or any share', async () => {
  const ctx = await setupTest();

  const sealed = await encodeConsolidationSummary(
    'diff-1',
    'Two items about tea conflict.',
    ctx.keys,
  );

  for (const value of [sealed.sealed, ...sealed.shares.map((share) => share.sealed)]) {
    expect(value).toMatch(/^[A-Za-z0-9+/]+=*$/u);
    expect(Buffer.from(value, 'base64').toString('latin1')).not.toInclude('tea');
  }
});
