const ecdh = { name: 'ECDH', namedCurve: 'P-256' } as const;

// The salt is the request's ephemeral public key. The recipient key is not in it, because the
// opener holds only a private key, and the ECDH secret already binds the recipient.
const info = new TextEncoder().encode('nixie turn-input spool 1');

export async function deriveSpoolKey(
  privateKey: CryptoKey,
  peerPublicKey: Uint8Array,
  ephemeralPublicKey: Uint8Array,
): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey('raw', new Uint8Array(peerPublicKey), ecdh, false, []);
  const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(ephemeralPublicKey), info },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
