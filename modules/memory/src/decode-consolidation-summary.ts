import invariant from 'tiny-invariant';
import { z } from 'zod';
import { defineSealedCodec } from './define-sealed-codec';
import { sealedTextSchema } from './sealed-text-schema';
import type { SealedSummary, SummaryShare } from './sealed-types';
import { summaryKeyBytes } from './summary-key-bytes';

const summaryText = defineSealedCodec('consolidation-summary/', sealedTextSchema);

export async function decodeConsolidationSummary(
  diffID: string,
  summary: SealedSummary,
  keys: ReadonlyMap<string, CryptoKey>,
): Promise<string> {
  const summaryKey = await decodeSummaryKey(diffID, summary.shares, keys);
  const key = await crypto.subtle.importKey('raw', summaryKey, 'AES-GCM', false, ['decrypt']);
  const value = await summaryText.decode(key, diffID, summary.sealed);

  return value.text;
}

const summaryShare = defineSealedCodec('consolidation-summary/', z.base64());

async function decodeSummaryKey(
  diffID: string,
  shares: readonly SummaryShare[],
  keys: ReadonlyMap<string, CryptoKey>,
): Promise<Uint8Array<ArrayBuffer>> {
  const summaryKey = new Uint8Array(summaryKeyBytes);

  for (const share of shares) {
    const itemKey = keys.get(share.itemID);

    invariant(itemKey !== undefined, 'the reader opens a summary only with every share key');

    const value = await summaryShare.decode(itemKey, `${diffID}/${share.itemID}`, share.sealed);

    for (const [index, byte] of Buffer.from(value, 'base64').entries()) {
      summaryKey[index] = (summaryKey[index] ?? 0) ^ byte;
    }
  }

  return summaryKey;
}
