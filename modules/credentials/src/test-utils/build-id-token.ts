// An ID token with the claims a test names. The signature is a placeholder: nixie checks the
// claims of a token that came from the provider's token endpoint, not its signature.
export function buildIDToken(claims: Readonly<Record<string, unknown>>): string {
  return [{ alg: 'none' }, claims, 'signature']
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.');
}
