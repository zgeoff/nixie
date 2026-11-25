import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';
import { readPackageFile } from './read-package-file';

async function setupTest() {
  const ctx = await startTestDevices();

  await ctx.seed.package('chart.js@4.4.6', {
    'dist/chart.js': 'var Chart = 1;',
    'style.css': 'a{}',
  });

  return {
    ...ctx,
    read: (name: string, version: string, path: string) =>
      readPackageFile(
        { db: ctx.log.writer.db, dataDir: ctx.log.writer.dataDir },
        { name, version, path },
      ),
  };
}

test('it returns a file of an approved package with its media type', async () => {
  const ctx = await setupTest();
  const file = await ctx.read('chart.js', '4.4.6', 'dist/chart.js');

  expect([new TextDecoder().decode(file?.bytes), file?.mediaType]).toStrictEqual([
    'var Chart = 1;',
    'text/javascript; charset=utf-8',
  ]);
});

test('it serves a stylesheet as css', async () => {
  const ctx = await setupTest();
  const file = await ctx.read('chart.js', '4.4.6', 'style.css');

  expect(file?.mediaType).toBe('text/css; charset=utf-8');
});

test.each([
  ['a package nobody approved', 'd3', '7.9.0', 'dist/chart.js'],
  ['a version nobody approved', 'chart.js', '4.4.5', 'dist/chart.js'],
  ['a path the package does not hold', 'chart.js', '4.4.6', 'secret.js'],
  ['a path that climbs out of the folder', 'chart.js', '4.4.6', '../chart.js@4.4.6/dist/chart.js'],
])('it returns nothing for %s', async (_title, name, version, path) => {
  const ctx = await setupTest();
  const file = await ctx.read(name, version, path);

  expect(file).toBeNull();
});
