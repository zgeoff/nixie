const ivBytes = 12;

// A 12-byte random IV, then the AES-256-GCM ciphertext.
export async function sealWithKey(
  key: CryptoKey,
  additionalData: string,
  plain: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(ivBytes));

  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(additionalData) },
    key,
    plain,
  );

  const out = new Uint8Array(ivBytes + sealed.byteLength);

  out.set(iv, 0);
  out.set(new Uint8Array(sealed), ivBytes);

  return out;
}
