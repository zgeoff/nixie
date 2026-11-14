import { expect, test } from 'bun:test';
import { $ } from 'bun';
import { resolveInstalledCLIPath } from './resolve-installed-cli-path';

test('it finds a CLI that prints its version', async () => {
  const result = await $`${resolveInstalledCLIPath()} --version`.nothrow().quiet();

  expect(result.exitCode).toBe(0);
});
