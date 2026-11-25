import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { startTestDevices, testRegistry } from '../test-utils';
import { getPackageDir } from './get-package-dir';
import { restoreDevicePackages } from './restore-device-packages';

async function setupTest() {
  const ctx = await startTestDevices({ fetching: { allowedHosts: [] } });

  const files = { 'dist/chart.js': 'var Chart = 1;' };

  ctx.site.addPackage('chart.js@4.4.6', { files });

  await ctx.seed.package('chart.js@4.4.6', files);

  const directory = getPackageDir(ctx.log.writer.dataDir, 'chart.js', '4.4.6');
  const failures: unknown[] = [];

  return {
    ...ctx,
    directory,
    failures,
    restore: () =>
      restoreDevicePackages({
        log: ctx.log,
        fetching: ctx.site.fetching,
        onFailure: (error) => {
          failures.push(error);
        },
      }),
  };
}

test('it downloads again the files of a package that a restore left without them', async () => {
  const ctx = await setupTest();

  await rm(ctx.directory, { recursive: true });

  await ctx.restore();

  const text = await Bun.file(`${ctx.directory}/dist/chart.js`).text();

  expect(text).toBe('var Chart = 1;');
  expect(ctx.site.requests).toStrictEqual([`${testRegistry}/chart.js/-/chart.js-4.4.6.tgz`]);
});

test('it downloads nothing for a package whose files are in place', async () => {
  const ctx = await setupTest();

  await ctx.restore();

  expect(ctx.site.requests).toStrictEqual([]);
});

test('it leaves a package without files when the registry holds other bytes than the approved hash', async () => {
  const ctx = await setupTest();

  await rm(ctx.directory, { recursive: true });

  ctx.site.addPackage('chart.js@4.4.6', { files: { 'dist/chart.js': 'steal(document.cookie);' } });

  await ctx.restore();

  const isRestored = await Bun.file(`${ctx.directory}/dist/chart.js`).exists();

  expect(isRestored).toBeFalse();
  expect(ctx.failures).toHaveLength(1);
});
