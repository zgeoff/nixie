import { sealedIVBytes } from './encode-sealed-json';

// Opens what encodeSealedJSON sealed and parses the JSON. A wrong key, wrong additional data or a
// changed byte rejects.
export async function decodeSealedJSON(
  key: CryptoKey,
  additionalData: string,
  sealed: string,
): Promise<unknown> {
  const bytes = new Uint8Array(Buffer.from(sealed, 'base64'));
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes.subarray(0, sealedIVBytes),
      additionalData: new TextEncoder().encode(additionalData),
    },
    key,
    bytes.subarray(sealedIVBytes),
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}
