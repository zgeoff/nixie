const ivBytes = 12;

// Returns null for bytes that fail the key, the additional data or the length.
export async function openWithKey(
  key: CryptoKey,
  additionalData: string,
  sealed: Uint8Array,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (sealed.length <= ivBytes) {
    return null;
  }

  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(sealed.subarray(0, ivBytes)),
        additionalData: new TextEncoder().encode(additionalData),
      },
      key,
      new Uint8Array(sealed.subarray(ivBytes)),
    );

    return new Uint8Array(plain);
  } catch {
    return null;
  }
}
