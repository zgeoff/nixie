export interface SealedAttachment {
  readonly position: number;
  readonly sealed: Uint8Array<ArrayBuffer>;
}

// Decrypts what encodeAttachment wrote. A wrong key, key ID or position, or a changed byte, rejects.
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

const IV_BYTES = 12;
