import type { PromptOverride } from './types';

export function buildPromptOverrideHash(override: PromptOverride | undefined): string | null {
  if (override === undefined) {
    return null;
  }

  const parts = Object.entries(override.parts).toSorted(([left], [right]) =>
    left < right ? -1 : 1,
  );

  return new Bun.CryptoHasher('sha256')
    .update(JSON.stringify([parts, override.template]))
    .digest('hex');
}
