import { forgettableKinds } from '@heynixie/contract';

const kinds: readonly string[] = forgettableKinds;

export function isForgettableKind(kind: string): boolean {
  return kinds.includes(kind);
}
