// Accepts only the canonical unpadded form, so one byte string has one text.
export function parseBase64URL(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/u.test(text) || text.length % 4 === 1) {
    return null;
  }

  const bytes = new Uint8Array(Buffer.from(text, 'base64url'));

  return Buffer.from(bytes).toString('base64url') === text ? bytes : null;
}
