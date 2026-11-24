import type { ErasableDescriptor } from '@heynixie/log';
import { buildForgettableKindsSource } from './build-forgettable-kinds-source';

// The message of a committed list file that differs from the descriptors, or null when it matches.
export function checkForgettableKinds(
  committed: string,
  descriptors: readonly ErasableDescriptor[],
): string | null {
  if (committed === buildForgettableKindsSource(descriptors)) {
    return null;
  }

  return 'libs/contract/src/contract/forgettable-kinds.ts differs from the erasable descriptors. Run `bun run --cwd apps/server forgettable-kinds` and commit the result.';
}
