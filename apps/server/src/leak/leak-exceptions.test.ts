import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { featureIDs } from '@heynixie/contract';
import { collectCorePackageDirs } from '../test-utils/collect-core-package-dirs';
import { collectImportFaults } from '../test-utils/collect-import-faults';
import { collectImportLeaks } from '../test-utils/collect-import-leaks';
import { collectNameFaults } from '../test-utils/collect-name-faults';
import { collectNeedlessLeakingTags } from '../test-utils/collect-needless-leaking-tags';
import { collectStaleImportExceptions } from '../test-utils/collect-stale-import-exceptions';
import { collectStaleNameExceptions } from '../test-utils/collect-stale-name-exceptions';
import { collectStaleOwnedPaths } from '../test-utils/collect-stale-owned-paths';
import { isInside } from '../test-utils/is-inside';
import { readNameLeaks } from '../test-utils/read-name-leaks';
import { readRepoPackages } from '../test-utils/read-repo-packages';
import { toAdapterSystem } from '../test-utils/to-adapter-system';
import { leakExceptions } from './leak-exceptions';

async function setupTest() {
  const root = join(import.meta.dir, '../../../..');

  const modules = await readRepoPackages(root, 'modules');
  const adapters = await readdir(join(root, 'adapters'));

  return {
    modules,
    corePackageDirs: collectCorePackageDirs(modules),
    readNameLeaks: (packageDirs: readonly string[]) =>
      readNameLeaks(
        root,
        packageDirs,
        [...featureIDs, ...adapters.map((folder) => toAdapterSystem(folder))],
        ['libs/contract/src/contract/feature-ids.ts'],
      ),
  };
}

// Parsing every core package in one test takes seconds, so each test reads one share of them.
test.each([0, 1, 2, 3, 4, 5, 6, 7])(
  'it finds no feature ID or outside-service name beyond the exceptions, and no name exception that matches nothing, in share %i of 8 of the core modules and the contract',
  async (share) => {
    const ctx = await setupTest();

    const packageDirs = ctx.corePackageDirs.filter((_, index) => index % 8 === share);

    const leaks = await ctx.readNameLeaks(packageDirs);

    const exceptions = leakExceptions.names.filter((exception) =>
      packageDirs.some((directory) => isInside(exception.where, directory)),
    );

    expect({
      faults: collectNameFaults(leaks, leakExceptions.names, leakExceptions.owned),
      stale: collectStaleNameExceptions(leaks, exceptions),
      staleOwned: collectStaleOwnedPaths(leaks, leakExceptions.owned, packageDirs),
    }).toStrictEqual({ faults: [], stale: [], staleOwned: [] });
  },
);

test('it places each name exception inside a core module or the contract', async () => {
  const ctx = await setupTest();

  expect(leakExceptions.names.map((exception) => exception.where)).toSatisfyAll((where: string) =>
    ctx.corePackageDirs.some((directory) => isInside(where, directory)),
  );
});

test('it finds no core module that depends on a feature module, beyond the exceptions', async () => {
  const ctx = await setupTest();

  expect(
    collectImportFaults(collectImportLeaks(ctx.modules), leakExceptions.imports),
  ).toStrictEqual([]);
});

test('it finds no import exception that matches nothing', async () => {
  const ctx = await setupTest();

  expect(
    collectStaleImportExceptions(collectImportLeaks(ctx.modules), leakExceptions.imports),
  ).toStrictEqual([]);
});

test('it tags a module leaking only while it depends on a feature or a leaking module', async () => {
  const ctx = await setupTest();

  expect(collectNeedlessLeakingTags(ctx.modules)).toStrictEqual([]);
});
