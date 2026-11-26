import type { RepoPackage } from './types';

// The packages whose code the names check reads: each module that is not a feature, and the
// contract.
export function collectCorePackageDirs(modules: readonly RepoPackage[]): string[] {
  return [
    ...modules.filter((pkg) => !pkg.tags.includes('feature')).map((pkg) => pkg.directory),
    'libs/contract',
  ];
}
