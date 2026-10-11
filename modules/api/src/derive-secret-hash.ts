// Derives the SHA-256 hash, in hex, under which nixie keeps a session token or an enrolment code.
// Both are random with enough entropy that a hash with no salt cannot be reversed by guessing.
export function deriveSecretHash(secret: string): string {
  return new Bun.CryptoHasher('sha256').update(secret).digest('hex');
}
