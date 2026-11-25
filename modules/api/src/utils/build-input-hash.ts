import type { JSONObject } from '@heynixie/log';

// A hash of free text alone confirms a guess at the text, so a caller hashes free text only beside
// a secret. `omit` names the fields the hash leaves out, such as a secret, whose hash is a copy.
export function buildInputHash(input: JSONObject, omit: readonly string[] = []): string {
  const sorted = Object.fromEntries(
    Object.entries(input)
      .filter(([name]) => !omit.includes(name))
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );

  return new Bun.CryptoHasher('sha256').update(JSON.stringify(sorted)).digest('hex');
}
