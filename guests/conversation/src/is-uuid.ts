import type { UUID } from 'node:crypto';

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;

export function isUUID(value: string): value is UUID {
  return uuidPattern.test(value);
}
