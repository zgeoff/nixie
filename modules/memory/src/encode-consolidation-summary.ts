import invariant from 'tiny-invariant';
import { encodeSealedJSON } from './encode-sealed-json';

// A consolidation summary as the store keeps it: the text sealed under a fresh key, and that key
// split into one share for each item the session was shown, each share sealed under its item's key.
export interface SealedSummary {
  readonly sealed: string;
  readonly shares: readonly SummaryShare[];
}

export interface SummaryShare {
  readonly itemID: string;
  readonly sealed: string;
}

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
    sealed: await encodeSealedJSON(key, `consolidation-summary/${diffID}`, { text }),
    shares: await Promise.all(
      [...keys].map(async ([itemID, itemKey], index) => ({
        itemID,
        sealed: await encodeSealedJSON(
          itemKey,
          `consolidation-summary/${diffID}/${itemID}`,
          Buffer.from(shares[index] ?? new Uint8Array()).toString('base64'),
        ),
      })),
    ),
  };
}

export const summaryKeyBytes = 32;

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
