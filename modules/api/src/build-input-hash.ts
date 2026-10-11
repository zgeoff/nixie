import type { JSONObject } from '@heynixie/log';

// Builds the SHA-256 hash, in hex, of a checked action's input with its keys sorted, so a retry
// with the same input matches whatever order the client wrote its fields in. A hash of free text
// alone would confirm a guess at it, so the caller hashes free text only beside a secret.
export function buildInputHash(input: JSONObject): string {
  const sorted = Object.fromEntries(
    Object.entries(input).toSorted(([left], [right]) => left.localeCompare(right)),
  );

  return new Bun.CryptoHasher('sha256').update(JSON.stringify(sorted)).digest('hex');
}
