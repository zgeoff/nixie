import { createHash } from 'node:crypto';

// The hex SHA-256 of bytes, or of a string's UTF-8 bytes.
export function buildSHA256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
