import { deriveSpoolKey } from './derive-spool-key';
import { parseBase64URL } from './parse-base64url';
import { parseJSONOrNull } from './parse-json-or-null';
import type { SpoolHeader } from './spool-header';
import { spoolHeaderSchema } from './spool-header';

export async function openSpoolFile(
  file: Uint8Array,
  privateKey: CryptoKey,
): Promise<{ header: SpoolHeader; body: Uint8Array } | null> {
  try {
    return await openFile(file, privateKey);
  } catch {
    return null;
  }
}

const headerLimitBytes = 64 * 1024;
const gcmTagBytes = 16;

async function openFile(
  file: Uint8Array,
  privateKey: CryptoKey,
): Promise<{ header: SpoolHeader; body: Uint8Array } | null> {
  if (file.length < 4) {
    return null;
  }

  const headerLength = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(0);

  if (headerLength > headerLimitBytes || 4 + headerLength + gcmTagBytes > file.length) {
    return null;
  }

  const prefix = file.subarray(0, 4 + headerLength);

  const headerText = new TextDecoder().decode(prefix.subarray(4));

  const parsed = spoolHeaderSchema.safeParse(parseJSONOrNull(headerText));

  if (!parsed.success) {
    return null;
  }

  const header = parsed.data;
  const ephemeralKey = parseBase64URL(header.ephemeralKey);
  const iv = parseBase64URL(header.iv);

  if (ephemeralKey === null || iv === null) {
    return null;
  }

  const key = await deriveSpoolKey(privateKey, ephemeralKey, ephemeralKey);

  // the additional data is the prefix's bytes as they sit in the file, never a re-written header
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: new Uint8Array(prefix), tagLength: 128 },
    key,
    new Uint8Array(file.subarray(prefix.length)),
  );

  const body = new Uint8Array(decrypted);

  return body.length === header.bytes ? { header, body } : null;
}
