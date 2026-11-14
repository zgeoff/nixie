export interface PlainAttachment {
  readonly position: number;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

const IV_BYTES = 12;

export async function encodeAttachment(
  key: CryptoKey,
  keyID: string,
  attachment: PlainAttachment,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(`${keyID}#${attachment.position}`),
    },
    key,
    attachment.bytes,
  );

  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength);

  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), IV_BYTES);

  return sealed;
}
