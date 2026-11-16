import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { parseBundleArgs, writeGuestBundle } from './write-guest-bundle';

test('it reads the out folder from the flag', () => {
  expect(parseBundleArgs(['--out', '/out/codex'])).toStrictEqual({
    isValid: true,
    args: { outDir: '/out/codex' },
  });
});

test('it refuses no flag with the usage', () => {
  expect(parseBundleArgs([])).toStrictEqual({
    isValid: false,
    usage: 'usage: bun write-guest-bundle.ts --out <out_dir>',
  });
});

test('it exits non-zero with the usage when the flag is missing', async () => {
  const result = await $`${process.execPath} ${join(import.meta.dir, 'write-guest-bundle.ts')}`
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 2,
    stderr: 'usage: bun write-guest-bundle.ts --out <out_dir>\n',
  });
});

test('it writes the turn bundle, which imports nothing from the workspace', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'nixie-codex-bundle-'));

  onTestFinished(() => rm(outDir, { recursive: true, force: true }));

  await writeGuestBundle({ outDir });

  const main = await readFile(join(outDir, 'main.js'), 'utf8');

  expect([await readdir(outDir), main.includes('@heynixie/')]).toStrictEqual([['main.js'], false]);
});
