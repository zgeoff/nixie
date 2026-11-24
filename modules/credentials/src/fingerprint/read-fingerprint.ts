// The first 8 hex digits of an HMAC-SHA-256 of the value under the fingerprint key. It shows a
// rotation without the value, and a short value is not guessable from it without the key.
export async function readFingerprint(value: string, fingerprintKey: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    fingerprintKey,
    new TextEncoder().encode(value),
  );

  return Buffer.from(signature).toString('hex').slice(0, 8);
}
