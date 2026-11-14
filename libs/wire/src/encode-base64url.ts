export function encodeBase64URL(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}
