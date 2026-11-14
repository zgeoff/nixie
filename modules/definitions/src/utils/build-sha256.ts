import { createHash } from 'node:crypto';

export function buildSHA256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
