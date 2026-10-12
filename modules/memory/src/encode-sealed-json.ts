import type { JSONValue } from '@heynixie/log';

// Seals a JSON value with AES-256-GCM under a key, as base64 of the 12-byte IV followed by the
// ciphertext. The additional data binds the value to its place, so a ciphertext copied elsewhere
// does not decrypt.
export async function encodeSealedJSON(
  key: CryptoKey,
  additionalData: string,
  value: JSONValue,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(sealedIVBytes));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(additionalData) },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const sealed = new Uint8Array(sealedIVBytes + ciphertext.byteLength);

  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), sealedIVBytes);
  return Buffer.from(sealed).toString('base64');
}

export const sealedIVBytes = 12;
