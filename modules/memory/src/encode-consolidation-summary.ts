import invariant from 'tiny-invariant';
import { z } from 'zod';
import { defineSealedCodec } from './define-sealed-codec';
import { sealedTextSchema } from './sealed-text-schema';
import type { SealedSummary } from './sealed-types';
import { summaryKeyBytes } from './summary-key-bytes';

// Seals a run's summary so that it opens only while every item the session was shown keeps its
// key, because it can hold any of their words. The diff ID binds the summary and each share to the
// run, so neither opens as another run's.
export async function encodeConsolidationSummary(
  diffID: string,
  text: string,
  keys: ReadonlyMap<string, CryptoKey>,
): Promise<SealedSummary> {
  invariant(keys.size > 0, 'a summary comes only from a session that was shown items');

  const summaryKey = crypto.getRandomValues(new Uint8Array(summaryKeyBytes));
  const shares = splitSummaryKey(summaryKey, keys.size);

  const key = await crypto.subtle.importKey('raw', summaryKey, 'AES-GCM', false, ['encrypt']);

  return {
    sealed: await summaryText.encode(key, diffID, { text }),
    shares: await Promise.all(
      [...keys].map(async ([itemID, itemKey], index) => ({
        itemID,
        sealed: await summaryShare.encode(
          itemKey,
          `${diffID}/${itemID}`,
          Buffer.from(shares[index] ?? new Uint8Array()).toString('base64'),
        ),
      })),
    ),
  };
}

const summaryText = defineSealedCodec('consolidation-summary/', sealedTextSchema);

// a share of the summary's key, as base64
const summaryShare = defineSealedCodec('consolidation-summary/', z.base64());

// n random shares whose XOR is the key, so every share is needed and any n - 1 reveal nothing
function splitSummaryKey(summaryKey: Uint8Array, count: number): readonly Uint8Array[] {
  const shares = Array.from({ length: count - 1 }, () =>
    crypto.getRandomValues(new Uint8Array(summaryKeyBytes)),
  );

  const last = Uint8Array.from(summaryKey);

  for (const share of shares) {
    for (const [index, byte] of share.entries()) {
      last[index] = (last[index] ?? 0) ^ byte;
    }
  }

  return [...shares, last];
}
