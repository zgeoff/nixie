const alphabets = {
  alphanumeric: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  lowercaseAlphanumeric: 'abcdefghijklmnopqrstuvwxyz0123456789',
  hex: 'abcdef0123456789',
  digits: '0123456789',
  base32: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
} as const;

export type KeyKind = keyof typeof alphabets;

// Builds a key of a kind and length. The same arguments always give the same key, and no committed
// file holds the key, so no secret scan flags it. A different seed gives a different key.
export function buildKey(kind: KeyKind, length: number, seed = 1): string {
  const alphabet = alphabets[kind];
  let state = seed >>> 0;
  let key = '';

  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    key += alphabet.charAt((state >>> 8) % alphabet.length);
  }

  return key;
}
