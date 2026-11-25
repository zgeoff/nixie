// The SHA-256 of a consent's state. A request keeps the hash and never the state.
export function hashConsentState(state: string): string {
  return new Bun.CryptoHasher('sha256').update(state).digest('hex');
}
