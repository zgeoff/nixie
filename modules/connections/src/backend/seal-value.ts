const IV_BYTES = 12;

export interface SealContext {
  readonly keyID: string;
  readonly table: string;
  readonly column: string;
}

// Seals a value under a key of the key store. The key ID, the table and the column are bound in as
// additional data, so a sealed value copied to another row or column fails to open.
export async function sealValue(
  key: CryptoKey,
  context: SealContext,
  value: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: buildAdditionalData(context) },
    key,
    new TextEncoder().encode(value),
  );

  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength);

  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), IV_BYTES);

  return sealed;
}

export async function openValue(
  key: CryptoKey,
  context: SealContext,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: sealed.subarray(0, IV_BYTES),
      additionalData: buildAdditionalData(context),
    },
    key,
    sealed.subarray(IV_BYTES),
  );

  return new TextDecoder().decode(plaintext);
}

function buildAdditionalData(context: SealContext): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${context.keyID}:${context.table}:${context.column}`);
}
