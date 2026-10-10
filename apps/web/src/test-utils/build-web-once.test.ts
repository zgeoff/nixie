import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildWebOnce } from './build-web-once';

test('it builds the web server entry once and shares it', async () => {
  const paths = await Promise.all([buildWebOnce(), buildWebOnce()]);

  expect(paths).toStrictEqual([
    join(import.meta.dir, '..', '..', 'dist', 'server', 'server.js'),
    join(import.meta.dir, '..', '..', 'dist', 'server', 'server.js'),
  ]);
  const built = await Bun.file(
    join(import.meta.dir, '..', '..', 'dist', 'server', 'server.js'),
  ).exists();

  expect(built).toBeTrue();
}, 120_000);
