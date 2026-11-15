const rpIDHashLength = 32;
const flagsOffset = 32;
const counterOffset = 33;
const authenticatorDataLength = 37;
const userVerifiedFlag = 0x04;
const backupStateFlag = 0x10;

export interface AuthenticatorData {
  readonly rpIDHash: string;
  readonly isUserVerified: boolean;
  readonly isBackedUp: boolean;
  readonly counter: number;
}

// The fixed head of authenticator data, which WebAuthn lays out as the RP ID hash, a flags byte and
// a 4-byte big-endian counter. Returns null for data shorter than that.
export function parseAuthenticatorData(base64URL: string): AuthenticatorData | null {
  const bytes = Buffer.from(base64URL, 'base64url');

  if (bytes.length < authenticatorDataLength) {
    return null;
  }

  const flags = bytes.readUInt8(flagsOffset);

  return {
    rpIDHash: bytes.subarray(0, rpIDHashLength).toString('hex'),
    isUserVerified: (flags & userVerifiedFlag) !== 0,
    isBackedUp: (flags & backupStateFlag) !== 0,
    counter: bytes.readUInt32BE(counterOffset),
  };
}
