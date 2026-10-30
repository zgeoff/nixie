// Crockford's base32 alphabet leaves out i, l, o and u, so a code read off a screen and typed on a
// phone has no look-alike letters.
const alphabet = '0123456789abcdefghjkmnpqrstvwxyz';

// Turns random bytes into a code of one character for each byte, 5 random bits each.
export function buildPairingCode(randomBytes: Uint8Array): string {
  return Array.from(randomBytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
