import { parseBase64URL } from '../parse-base64url';

const groupOrder =
  0xff_ff_ff_ff_00_00_00_00_ff_ff_ff_ff_ff_ff_ff_ff_bc_e6_fa_ad_a7_17_9e_84_f3_b9_ca_c2_fc_63_25_51n;

// PKCS#8 for a P-256 key, up to the 32 scalar bytes: no public key field, so the runtime computes
// the public point itself
const pkcs8Prefix = Uint8Array.from([
  0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
  0x01, 0x04, 0x20,
]);

export interface SeededKeyPair {
  readonly privateKey: CryptoKey;

  // uncompressed SEC1, 65 bytes
  readonly publicKey: Uint8Array;
}

// A fixture holds only the public seed text, and a test derives each key from it. WebCrypto has no
// seeded key generation, so the scalar is 1 + (SHA-256(seed) mod (n − 1)).
export async function deriveSeededKeyPair(seed: string): Promise<SeededKeyPair> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));

  const hash = new Uint8Array(digest);

  const scalar = 1n + (BigInt(`0x${Buffer.from(hash).toString('hex')}`) % (groupOrder - 1n));
  const scalarBytes = Buffer.from(scalar.toString(16).padStart(64, '0'), 'hex');

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.concat([pkcs8Prefix, scalarBytes]),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );

  const jwk = await crypto.subtle.exportKey('jwk', privateKey);

  const x = parseBase64URL(jwk.x ?? '');
  const y = parseBase64URL(jwk.y ?? '');

  if (x === null || y === null) {
    throw new Error('the seeded key has no public point');
  }

  return { privateKey, publicKey: Uint8Array.from([0x04, ...x, ...y]) };
}
