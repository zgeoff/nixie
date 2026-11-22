import { expect, test } from 'bun:test';
import { basename, dirname } from 'node:path';
import { readWebBuild } from './read-web-build';

test('it returns the server entry of the web build in the run’s template, the same for each caller', async () => {
  const paths = await Promise.all([readWebBuild(), readWebBuild()]);
  const isBuilt = await Bun.file(paths[0]).exists();

  const templateName = basename(dirname(dirname(paths[0] ?? '')));

  expect(paths[1]).toBe(paths[0]);
  expect(templateName).toStartWith('nixie-web-build-');
  expect(paths[0]).toEndWith('/server/server.js');
  expect(isBuilt).toBeTrue();
});
