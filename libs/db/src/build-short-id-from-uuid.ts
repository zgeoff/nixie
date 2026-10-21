import { createHash } from 'node:crypto';

const letters = 'abcdefghijklmnopqrstuvwxyz';
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';

export function buildShortIDFromUUID(uuid: string): string {
  const digest = createHash('sha256').update(uuid).digest();
  let rest = digest.subarray(1, 9).readBigUInt64BE();
  let id = letters.charAt(digest.readUInt8(0) % letters.length);

  while (id.length < 10) {
    id += alphabet.charAt(Number(rest % 36n));
    rest /= 36n;
  }

  return id;
}
