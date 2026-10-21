import type { JSONObject } from '@heynixie/log';

// A hash of free text alone confirms a guess at the text, so a caller hashes free text only beside
// a secret.
export function buildInputHash(input: JSONObject): string {
  const sorted = Object.fromEntries(
    Object.entries(input).toSorted(([left], [right]) => left.localeCompare(right)),
  );

  return new Bun.CryptoHasher('sha256').update(JSON.stringify(sorted)).digest('hex');
}
