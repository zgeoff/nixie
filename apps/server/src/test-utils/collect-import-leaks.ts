import type { ImportLeak, RepoPackage } from './types';

// Each feature module that a core module declares as a dependency, in its dependencies or its dev
// dependencies.
export function collectImportLeaks(modules: readonly RepoPackage[]): ImportLeak[] {
  const featureNames = new Set(
    modules.filter((pkg) => pkg.tags.includes('feature')).map((pkg) => pkg.name),
  );

  return modules
    .filter((pkg) => !pkg.tags.includes('feature'))
    .flatMap((pkg) =>
      pkg.dependsOn
        .filter((name) => featureNames.has(name))
        .map((name) => ({ directory: pkg.directory, importName: name })),
    );
}
