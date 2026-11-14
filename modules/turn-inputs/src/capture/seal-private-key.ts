import { sealWithKey } from '../utils/seal-with-key';

// Seals the pkcs8 bytes of a capture's private key, and zeroes the bytes after.
export async function sealPrivateKey(
  key: CryptoKey,
  additionalData: string,
  pkcs8: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await sealWithKey(key, additionalData, pkcs8);
  } finally {
    pkcs8.fill(0);
  }
}
