import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'preview-entry-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'var', 'lib', 'nixie-preview'), { recursive: true });
  await mkdir(join(root, 'bin'));

  // a recorder in place of bun, which writes one line of arguments per call
  await writeFile(join(root, 'bin', 'bun'), `#!/bin/sh\necho "$*" >> "${join(root, 'calls')}"\n`);
  await chmod(join(root, 'bin', 'bun'), 0o755);

  return { root, script: join(import.meta.dir, 'run-preview.sh') };
}

test('it runs nixie on the routed copy of the config when a host names a model route', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn(['sh', ctx.script, 'serve'], {
    env: {
      PATH: `${join(ctx.root, 'bin')}:${process.env['PATH'] ?? ''}`,
      NIXIE_PREVIEW_ROOT: ctx.root,
      NIXIE_PREVIEW_MODEL_ROUTE: 'preview-a',
    },
    stdout: 'ignore',
    stderr: 'inherit',
  });

  const code = await child.exited;
  const calls = await readFile(join(ctx.root, 'calls'), 'utf8');

  expect(code).toBe(0);

  expect(calls.split('\n')).toStrictEqual([
    `--define NIXIE_TEST_BUILD=true ${ctx.root}/app/apps/server/src/run-preview-route-config.ts --route preview-a --source ${ctx.root}/app/preview/config.yaml --target ${ctx.root}/var/lib/nixie-preview/config.yaml`,
    `--define NIXIE_TEST_BUILD=true ${ctx.root}/app/apps/server/src/main.ts serve --config ${ctx.root}/var/lib/nixie-preview/config.yaml --manifest ${ctx.root}/app/preview/sandbox-manifest.json --sops ${ctx.root}/app/preview/run-plain-sops.sh --encoder ${ctx.root}/app/node_modules/.cache/nixie-encoder`,
    '',
  ]);
});

test('it runs nixie on the config as it stands when no host names a model route', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn(['sh', ctx.script, 'serve'], {
    env: {
      PATH: `${join(ctx.root, 'bin')}:${process.env['PATH'] ?? ''}`,
      NIXIE_PREVIEW_ROOT: ctx.root,
    },
    stdout: 'ignore',
    stderr: 'inherit',
  });

  const code = await child.exited;
  const calls = await readFile(join(ctx.root, 'calls'), 'utf8');

  expect(code).toBe(0);

  expect(calls.split('\n')).toStrictEqual([
    `--define NIXIE_TEST_BUILD=true ${ctx.root}/app/apps/server/src/main.ts serve --config ${ctx.root}/app/preview/config.yaml --manifest ${ctx.root}/app/preview/sandbox-manifest.json --sops ${ctx.root}/app/preview/run-plain-sops.sh --encoder ${ctx.root}/app/node_modules/.cache/nixie-encoder`,
    '',
  ]);
});
