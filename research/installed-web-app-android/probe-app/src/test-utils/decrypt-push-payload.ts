import { concatBytes } from '../concat-bytes.ts';
import { deriveHKDF } from '../derive-hkdf.ts';

interface DecryptPushPayloadInput {
  body: Uint8Array<ArrayBuffer>;
  // the browser's ECDH key pair behind the subscription's p256dh key
  userAgentKeyPair: CryptoKeyPair;
  authSecret: Uint8Array<ArrayBuffer>;
}

// Decrypts a one-record aes128gcm push body the way a browser does, so a test can read what the
// server sent to a subscription.
export async function decryptPushPayload(
  input: DecryptPushPayloadInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const salt = input.body.subarray(0, 16);
  const keyIDLength = input.body[20] ?? 0;
  const senderPublicKey = input.body.subarray(21, 21 + keyIDLength);
  const ciphertext = input.body.subarray(21 + keyIDLength);
  const userAgentPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', input.userAgentKeyPair.publicKey),
  );
  const senderKey = await crypto.subtle.importKey(
    'raw',
    senderPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: senderKey },
      input.userAgentKeyPair.privateKey,
      256,
    ),
  );
  const keyInfo = concatBytes(
    new TextEncoder().encode('WebPush: info\0'),
    userAgentPublicKey,
    senderPublicKey,
  );
  const inputKeyMaterial = await deriveHKDF(input.authSecret, sharedSecret, keyInfo, 32);
  const contentKey = await deriveHKDF(
    salt,
    inputKeyMaterial,
    new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
    16,
  );
  const nonce = await deriveHKDF(
    salt,
    inputKeyMaterial,
    new TextEncoder().encode('Content-Encoding: nonce\0'),
    12,
  );
  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ciphertext),
  );
  // RFC 8188: the record ends with the delimiter and then only zero padding
  const delimiter = padded.findLastIndex((byte) => byte !== 0);

  if (padded[delimiter] !== 2) {
    throw new Error('push record has no last-record delimiter');
  }

  return padded.subarray(0, delimiter);
}
