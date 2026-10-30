export async function deriveHKDF(
  salt: Uint8Array<ArrayBuffer>,
  keyMaterial: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', keyMaterial, 'HKDF', false, ['deriveBits']);

  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8),
  );
}
