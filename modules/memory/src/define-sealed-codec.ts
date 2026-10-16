import type { JSONValue } from '@heynixie/log';
import type { z } from 'zod';
import type { SealedCodec } from './sealed-types';

// A codec for one shape of sealed JSON. The prefix and a value's place make the additional data, so
// a ciphertext opens only in the place it was sealed for, and the schema checks the value on both
// sides, so a sealed value of another shape rejects.
export function defineSealedCodec<Value extends JSONValue>(
  prefix: string,
  schema: z.ZodType<Value>,
): SealedCodec<Value> {
  return {
    encode: async (key, place, value) => {
      const parsed = schema.parse(value);

      return await encodeSealedJSON(key, `${prefix}${place}`, parsed);
    },
    decode: async (key, place, sealed) => {
      const value = await decodeSealedJSON(key, `${prefix}${place}`, sealed);

      return schema.parse(value);
    },
  };
}

const sealedIVBytes = 12;

// Seals a JSON value with AES-256-GCM under a key, as base64 of the 12-byte IV followed by the
// ciphertext. The additional data binds the value to its place, so a ciphertext copied elsewhere
// does not decrypt.
async function encodeSealedJSON(
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

// Opens what encodeSealedJSON sealed and parses the JSON. A wrong key, wrong additional data or a
// changed byte rejects.
async function decodeSealedJSON(
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
