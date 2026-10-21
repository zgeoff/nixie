export interface SealedAttachment {
  readonly position: number;
  readonly sealed: Uint8Array<ArrayBuffer>;
}

const IV_BYTES = 12;

export async function decodeAttachment(
  key: CryptoKey,
  keyID: string,
  attachment: SealedAttachment,
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: attachment.sealed.subarray(0, IV_BYTES),
      additionalData: new TextEncoder().encode(`${keyID}#${attachment.position}`),
    },
    key,
    attachment.sealed.subarray(IV_BYTES),
  );

  return new Uint8Array(plaintext);
}
