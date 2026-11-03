import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { readWebBuild } from './read-web-build';

test('it returns the server entry of the web build in the run’s template, the same for each caller', async () => {
  const paths = await Promise.all([readWebBuild(), readWebBuild()]);
  const isBuilt = await Bun.file(paths[0]).exists();

  const templates = join(
    import.meta.dir,
    '..',
    '..',
    'node_modules',
    '.cache',
    'nixie-test-bundles',
  );

  expect(paths[1]).toBe(paths[0]);
  expect(paths[0]).toStartWith(join(templates, 'nixie-web-build-'));
  expect(paths[0]).toEndWith('/server/server.js');
  expect(isBuilt).toBeTrue();
});
