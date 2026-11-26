import type { RepoPackage } from './types';

// The modules tagged leaking that depend on no feature module and on no other leaking module. A
// retrofit that removes the last leak of a module changes its tag to core.
export function collectNeedlessLeakingTags(modules: readonly RepoPackage[]): string[] {
  const reaching = new Set(
    modules
      .filter((pkg) => pkg.tags.includes('feature') || pkg.tags.includes('leaking'))
      .map((pkg) => pkg.name),
  );

  return modules
    .filter(
      (pkg) => pkg.tags.includes('leaking') && !pkg.dependsOn.some((name) => reaching.has(name)),
    )
    .map((pkg) => pkg.directory);
}
