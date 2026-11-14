const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function createSecret(kind: 'session-token' | 'enrolment-code'): string {
  if (kind === 'session-token') {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  }

  // 256 is a multiple of 32, so a byte modulo 32 keeps each character uniform.
  const characters = Array.from(
    crypto.getRandomValues(new Uint8Array(10)),
    (byte) => CODE_ALPHABET[byte % 32],
  ).join('');

  return `${characters.slice(0, 5)}-${characters.slice(5)}`;
}
