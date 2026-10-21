import { parseJSONObject } from './parse-json-object';
import type { JSONObject } from './types';

const IV_BYTES = 12;

// Decrypts what encodeErasable wrote. A wrong key, a wrong key ID or a changed byte rejects.
export async function decodeErasable(
  key: CryptoKey,
  keyID: string,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<JSONObject> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: sealed.subarray(0, IV_BYTES),
      additionalData: new TextEncoder().encode(keyID),
    },
    key,
    sealed.subarray(IV_BYTES),
  );

  return parseJSONObject(new TextDecoder().decode(plaintext));
}
