import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { runWebBuildOnce } from './run-web-build-once';

test('it builds the web server entry once and shares it', async () => {
  const paths = await Promise.all([runWebBuildOnce(), runWebBuildOnce()]);

  expect(paths).toStrictEqual([
    join(import.meta.dir, '..', '..', 'dist', 'server', 'server.js'),
    join(import.meta.dir, '..', '..', 'dist', 'server', 'server.js'),
  ]);

  const built = await Bun.file(
    join(import.meta.dir, '..', '..', 'dist', 'server', 'server.js'),
  ).exists();

  expect(built).toBeTrue();
}, 120_000);
