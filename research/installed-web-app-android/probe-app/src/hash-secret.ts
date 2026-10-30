import { createHash } from 'node:crypto';

export function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}
