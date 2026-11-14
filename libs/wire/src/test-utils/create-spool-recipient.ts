export interface SpoolRecipient {
  readonly privateKey: CryptoKey;

  // uncompressed SEC1, 65 bytes
  readonly sealTo: Uint8Array;
}

// a fresh P-256 key pair for a test that seals a body and opens it again
export async function createSpoolRecipient(): Promise<SpoolRecipient> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ]);

  const exported = await crypto.subtle.exportKey('raw', pair.publicKey);

  return { privateKey: pair.privateKey, sealTo: new Uint8Array(exported) };
}
