import { concatBytes } from './concat-bytes.ts';
import { deriveHKDF } from './derive-hkdf.ts';

// RFC 8291 message encryption for web push, with the aes128gcm content coding of RFC 8188: one
// record, so the record size only has to exceed the payload.
const recordSize = 4096;

interface EncryptPushPayloadInput {
  plaintext: Uint8Array;
  // the subscription's p256dh key, an uncompressed P-256 point
  userAgentPublicKey: Uint8Array<ArrayBuffer>;
  authSecret: Uint8Array<ArrayBuffer>;
  // fixed only by the RFC test vector; each push takes a fresh key pair and salt
  senderKeyPair?: CryptoKeyPair;
  salt?: Uint8Array<ArrayBuffer>;
}

export async function encryptPushPayload(
  input: EncryptPushPayloadInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const senderKeyPair = input.senderKeyPair ?? (await createSenderKeyPair());
  const salt = input.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const senderPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKeyPair.publicKey),
  );
  const userAgentKey = await crypto.subtle.importKey(
    'raw',
    input.userAgentPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: userAgentKey },
      senderKeyPair.privateKey,
      256,
    ),
  );
  const keyInfo = concatBytes(
    new TextEncoder().encode('WebPush: info\0'),
    input.userAgentPublicKey,
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
  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the last record, and the only one
  const padded = concatBytes(input.plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded),
  );
  const header = new Uint8Array(16 + 4 + 1);

  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize);
  header[20] = senderPublicKey.length;

  return concatBytes(header, senderPublicKey, ciphertext);
}

function createSenderKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}
