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
    readNameLeaks: () =>
      readNameLeaks(
        root,
        collectCorePackageDirs(modules),
        [...featureIDs, ...adapters.map((folder) => toAdapterSystem(folder))],
        ['libs/contract/src/contract/feature-ids.ts'],
      ),
  };
}

test('it finds no feature ID or outside-service name in a core module or the contract, beyond the exceptions', async () => {
  const ctx = await setupTest();
  const leaks = await ctx.readNameLeaks();

  expect(collectNameFaults(leaks, leakExceptions.names)).toStrictEqual([]);
});

test('it finds no name exception that matches nothing', async () => {
  const ctx = await setupTest();
  const leaks = await ctx.readNameLeaks();

  expect(collectStaleNameExceptions(leaks, leakExceptions.names)).toStrictEqual([]);
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
