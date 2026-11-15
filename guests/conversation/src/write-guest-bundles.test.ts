import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { parseBundleArgs, writeGuestBundles } from './write-guest-bundles';

test('it reads the out folder and the CLI path from the flags', () => {
  expect(
    parseBundleArgs(['--out', '/out/conversation', '--cli-path', '/app/claude']),
  ).toStrictEqual({ isValid: true, args: { outDir: '/out/conversation', cliPath: '/app/claude' } });
});

test.each([
  ['no flag', []],
  ['no CLI path', ['--out', '/out']],
  ['no out folder', ['--cli-path', '/app/claude']],
])('it refuses %s with the usage', (_case, argv) => {
  expect(parseBundleArgs(argv)).toStrictEqual({
    isValid: false,
    usage: 'usage: bun write-guest-bundles.ts --out <out_dir> --cli-path <cli_path>',
  });
});

test('it exits non-zero with the usage when a flag is missing', async () => {
  const result = await $`${process.execPath} ${join(import.meta.dir, 'write-guest-bundles.ts')}`
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 2,
    stderr: 'usage: bun write-guest-bundles.ts --out <out_dir> --cli-path <cli_path>\n',
  });
});

test('it writes the turn and check bundles with the CLI path in them', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'nixie-guest-bundles-'));

  onTestFinished(() => rm(outDir, { recursive: true, force: true }));

  await writeGuestBundles({ outDir, cliPath: '/app/claude' });

  const files = await readdir(outDir);
  const main = await readFile(join(outDir, 'main.js'), 'utf8');

  expect(files.toSorted()).toStrictEqual(['check.js', 'main.js']);
  expect(main).toInclude('"/app/claude"');
});
