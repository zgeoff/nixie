import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { installBrowserInCI } from './install-browser-in-ci';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-browser-install-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  createStubBin(binDir, 'bun');

  return {
    binDir,
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it installs the browser when the run is in CI', async () => {
  const ctx = await setupTest();

  installBrowserInCI({ ...ctx.env, CI: 'true' });

  expect(readStubCalls(ctx.binDir).map((call) => call.argv)).toStrictEqual([
    ['run', 'ci:install-browser'],
  ]);
});

test('it installs nothing outside CI', async () => {
  const ctx = await setupTest();

  installBrowserInCI(ctx.env);

  expect(readStubCalls(ctx.binDir)).toStrictEqual([]);
});
