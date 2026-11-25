import { decodeQuotedPrintable } from './decode-quoted-printable';

// The bytes of a body after its transfer encoding. The body is the latin1 reading of the raw bytes.
export function decodeBodyBytes(body: string, encoding: string): Uint8Array {
  const kind = encoding.trim().toLowerCase();

  if (kind === 'base64') {
    return Buffer.from(body.replaceAll(/\s+/gu, ''), 'base64');
  }

  if (kind === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }

  return Buffer.from(body, 'latin1');
}
