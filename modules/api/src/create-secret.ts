const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Creates a random secret: a session token of 32 bytes in base64url, or an enrolment code of 10
// characters from Crockford's base32, which leaves out the letters a person misreads, shown in 2
// groups of 5. 256 is a multiple of 32, so masking each byte keeps the code uniform.
export function createSecret(kind: 'session-token' | 'enrolment-code'): string {
  if (kind === 'session-token') {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  }

  const characters = Array.from(
    crypto.getRandomValues(new Uint8Array(10)),
    (byte) => CODE_ALPHABET[byte % 32],
  ).join('');

  return `${characters.slice(0, 5)}-${characters.slice(5)}`;
}
