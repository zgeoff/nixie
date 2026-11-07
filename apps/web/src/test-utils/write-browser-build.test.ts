import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBrowserBuild } from './read-browser-build';
import { writeBrowserBuild } from './write-browser-build';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-browser-build-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { build: readBrowserBuild({ RIG_BROWSER_BUILD_DIR: directory }) };
}

test('it returns the exit code of a web build that fails and bundles nothing', async () => {
  const ctx = await setupTest();
  const exitCode = await writeBrowserBuild(ctx.build, [process.execPath, '-e', 'process.exit(3)']);
  const bundled = await Bun.file(ctx.build.normalizeImagePath).exists();

  expect({ exitCode, bundled }).toStrictEqual({ exitCode: 3, bundled: false });
});

test('it bundles the image normaliser after a web build that passes', async () => {
  const ctx = await setupTest();
  const exitCode = await writeBrowserBuild(ctx.build, [process.execPath, '-e', 'process.exit(0)']);
  const bundled = await Bun.file(ctx.build.normalizeImagePath).exists();

  expect({ exitCode, bundled }).toStrictEqual({ exitCode: 0, bundled: true });
});
