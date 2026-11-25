// HKDF-SHA-256 of the deployment key with an empty salt and the info 'nixie fingerprint', imported
// as a non-extractable HMAC key, so the secrets file gains no entry.
export async function deriveFingerprintKey(deploymentKeyBytes: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(deploymentKeyBytes),
    'HKDF',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('nixie fingerprint'),
    },
    base,
    256,
  );

  return crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
