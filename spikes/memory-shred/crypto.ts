// oxlint-disable sort-vars
// AES-256-GCM per memory item, with each item key wrapped by a deployment key through AES-KW.
const IV_BYTES = 12,
  encoder = new TextEncoder(),
  decoder = new TextDecoder();

export interface Sealed {
  iv: Uint8Array;
  data: Uint8Array;
}

export function createDeploymentKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ length: 256, name: 'AES-KW' }, true, ['wrapKey', 'unwrapKey']);
}

export function createItemKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ length: 256, name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function encodeItemKey(key: CryptoKey, deploymentKey: CryptoKey): Promise<Uint8Array> {
  const wrapped = await crypto.subtle.wrapKey('raw', key, deploymentKey, 'AES-KW');
  return new Uint8Array(wrapped);
}

export function decodeItemKey(wrapped: Uint8Array, deploymentKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    deploymentKey,
    'AES-KW',
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

// The item ID and version are additional data, so a ciphertext cannot move to another row.
export async function encodeText(key: CryptoKey, text: string, aad: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES)),
    data = await crypto.subtle.encrypt(
      { additionalData: encoder.encode(aad), iv, name: 'AES-GCM' },
      key,
      encoder.encode(text),
    );
  return { data: new Uint8Array(data), iv };
}

export async function decodeText(key: CryptoKey, sealed: Sealed, aad: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { additionalData: encoder.encode(aad), iv: sealed.iv, name: 'AES-GCM' },
    key,
    sealed.data,
  );
  return decoder.decode(plain);
}
