import type { CaptureTag } from './capture-tag';
import { deriveSpoolKey } from './derive-spool-key';
import { encodeBase64URL } from './encode-base64url';
import type { SpoolHeader } from './spool-header';
import { spoolIVBytes } from './spool-header';

// Sealing to a tag proves nothing about the tag: a guest could swap its key for another valid
// point, which only makes that capture unreadable to the capture's owner.
export async function sealSpoolBody(
  tag: CaptureTag,
  header: Omit<SpoolHeader, 'ephemeralKey' | 'iv'>,
  body: Uint8Array,
): Promise<Uint8Array> {
  // a fresh pair for each request, so each derived key encrypts exactly one body
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);

  const exported = await crypto.subtle.exportKey('raw', pair.publicKey);

  const ephemeralPublic = new Uint8Array(exported);

  const iv = crypto.getRandomValues(new Uint8Array(spoolIVBytes));

  const key = await deriveSpoolKey(pair.privateKey, tag.sealTo, ephemeralPublic);

  const headerBytes = new TextEncoder().encode(
    JSON.stringify({
      version: header.version,
      captureID: header.captureID,
      writer: header.writer,
      counter: header.counter,
      receivedAt: header.receivedAt,
      route: header.route,
      api: header.api,
      endpoint: header.endpoint,
      bytes: header.bytes,
      ephemeralKey: encodeBase64URL(ephemeralPublic),
      iv: encodeBase64URL(iv),
    }),
  );

  const prefix = new Uint8Array(4 + headerBytes.length);

  new DataView(prefix.buffer).setUint32(0, headerBytes.length);

  prefix.set(headerBytes, 4);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: prefix, tagLength: 128 },
    key,
    new Uint8Array(body),
  );

  const ciphertext = new Uint8Array(encrypted);
  const file = new Uint8Array(prefix.length + ciphertext.length);

  file.set(prefix, 0);
  file.set(ciphertext, prefix.length);

  return file;
}
