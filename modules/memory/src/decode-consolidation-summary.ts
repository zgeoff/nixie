import invariant from 'tiny-invariant';
import { z } from 'zod';
import { decodeSealedJSON } from './decode-sealed-json';
import type { SealedSummary, SummaryShare } from './encode-consolidation-summary';
import { summaryKeyBytes } from './encode-consolidation-summary';

// Opens what encodeConsolidationSummary sealed, with the key of every item that holds a share. A
// wrong key, another run's diff ID, a missing share or a changed byte rejects.
export async function decodeConsolidationSummary(
  diffID: string,
  summary: SealedSummary,
  keys: ReadonlyMap<string, CryptoKey>,
): Promise<string> {
  const summaryKey = await decodeSummaryKey(diffID, summary.shares, keys);
  const key = await crypto.subtle.importKey('raw', summaryKey, 'AES-GCM', false, ['decrypt']);
  const value = await decodeSealedJSON(key, `consolidation-summary/${diffID}`, summary.sealed);

  return summaryText.parse(value).text;
}

const summaryText = z.strictObject({ text: z.string() });

// the summary's key: the XOR of every share, each opened under its item's key
async function decodeSummaryKey(
  diffID: string,
  shares: readonly SummaryShare[],
  keys: ReadonlyMap<string, CryptoKey>,
): Promise<Uint8Array<ArrayBuffer>> {
  const summaryKey = new Uint8Array(summaryKeyBytes);

  for (const share of shares) {
    const itemKey = keys.get(share.itemID);

    invariant(itemKey !== undefined, 'the reader opens a summary only with every share key');

    // oxlint-disable-next-line no-await-in-loop -- each share folds into the one key in turn
    const value = await decodeSealedJSON(
      itemKey,
      `consolidation-summary/${diffID}/${share.itemID}`,
      share.sealed,
    );

    for (const [index, byte] of Buffer.from(z.base64().parse(value), 'base64').entries()) {
      summaryKey[index] = (summaryKey[index] ?? 0) ^ byte;
    }
  }
  return summaryKey;
}
