import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { startTestDevices } from '../test-utils';
import { getPackageDir } from './get-package-dir';
import { readDevicePackage } from './read-device-packages';
import { writeDevicePackage } from './write-device-package';

async function setupTest() {
  const ctx = await startTestDevices({ fetching: { allowedHosts: [] } });

  return {
    ...ctx,
    directory: getPackageDir(ctx.log.writer.dataDir, 'chart.js', '4.4.6'),
    write: (text: string) =>
      writeDevicePackage(ctx, {
        name: 'chart.js',
        version: '4.4.6',
        integrity: `sha512-${text}`,
        publisher: 'a-publisher',
        files: [{ path: 'dist/chart.js', bytes: new TextEncoder().encode(text) }],
        thread: 'conversation',
      }),
  };
}

test('it serves the files whose hash the row pins when two installs of one version race', async () => {
  const ctx = await setupTest();
  const outcomes = await Promise.all([ctx.write('first'), ctx.write('second')]);
  const row = await readDevicePackage(ctx.log.writer.db, 'chart.js', '4.4.6');

  invariant(row, 'one install wrote the row');

  const onDisk = await readFile(join(ctx.directory, 'dist/chart.js'), 'utf8');

  expect(outcomes.toSorted()).toStrictEqual(['known', 'written']);
  expect(`sha512-${onDisk}`).toBe(row.integrity);
});

test('it leaves the files of the first install when a second install finds the row', async () => {
  const ctx = await setupTest();

  await ctx.write('first');

  const outcome = await ctx.write('second');
  const onDisk = await readFile(join(ctx.directory, 'dist/chart.js'), 'utf8');

  expect(outcome).toBe('known');
  expect(onDisk).toBe('first');
});
