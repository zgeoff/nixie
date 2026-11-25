// The S256 challenge of a PKCE verifier: the unpadded base64url of its SHA-256.
export function buildPKCEChallenge(verifier: string): string {
  return new Bun.CryptoHasher('sha256').update(verifier).digest('base64url');
}
