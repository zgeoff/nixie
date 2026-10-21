import type { JSONObject } from './types';

const IV_BYTES = 12;

export async function encodeErasable(
  key: CryptoKey,
  keyID: string,
  fields: JSONObject,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(keyID) },
    key,
    new TextEncoder().encode(JSON.stringify(fields)),
  );

  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength);

  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), IV_BYTES);

  return sealed;
}
