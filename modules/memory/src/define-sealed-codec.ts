import type { JSONValue } from '@heynixie/log';
import type { z } from 'zod';
import type { SealedCodec } from './sealed-types';

export function defineSealedCodec<Value extends JSONValue>(
  prefix: string,

  schema: z.ZodType<Value>,
): SealedCodec<Value> {
  return {
    encode: async (key, place, value) => {
      const parsed = schema.parse(value);

      const sealed = await encodeSealedJSON(key, `${prefix}${place}`, parsed);

      return sealed;
    },
    decode: async (key, place, sealed) => {
      const value = await decodeSealedJSON(key, `${prefix}${place}`, sealed);

      return schema.parse(value);
    },
  };
}

const sealedIVBytes = 12;

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
