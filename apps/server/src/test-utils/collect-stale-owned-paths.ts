import type { OwnedPaths } from '../types';
import { isInside } from './is-inside';
import type { NameLeak } from './types';

// One fault per owned path of a feature that sits in one of the packages and holds no name of that
// feature.
export function collectStaleOwnedPaths(
  leaks: readonly NameLeak[],
  owned: OwnedPaths,
  packageDirs: readonly string[],
): string[] {
  return Object.entries(owned).flatMap(([feature, paths]) =>
    paths
      .filter((path) => packageDirs.some((directory) => isInside(path, directory)))
      .filter((path) => !leaks.some((leak) => leak.name === feature && isInside(leak.file, path)))
      .map((path) => `the owned path ${path} of ${feature} holds no ${feature} name. Delete it.`),
  );
}
