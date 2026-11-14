// An enrolment code and a session token are random with enough entropy that no guess reverses a
// hash with no salt.
export function deriveSecretHash(secret: string): string {
  return new Bun.CryptoHasher('sha256').update(secret).digest('hex');
}
