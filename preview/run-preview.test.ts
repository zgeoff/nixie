import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'preview-entry-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const repo = join(import.meta.dir, '..');
  const app = join(root, 'app');

  await mkdir(join(root, 'var', 'lib', 'nixie-preview'), { recursive: true });
  await mkdir(join(app, 'apps', 'server', 'src'), { recursive: true });
  await mkdir(join(app, 'preview'));

  // the real route step and the real preview config, which bun reaches through the links, so the
  // route step resolves its imports from the repo
  await symlink(
    join(repo, 'apps', 'server', 'src', 'run-preview-route-config.ts'),
    join(app, 'apps', 'server', 'src', 'run-preview-route-config.ts'),
  );

  await symlink(join(repo, 'preview', 'config.yaml'), join(app, 'preview', 'config.yaml'));

  // a recorder in place of nixie, which writes the arguments it ran with
  await writeFile(
    join(app, 'apps', 'server', 'src', 'main.ts'),
    `await Bun.write(${JSON.stringify(join(root, 'calls.json'))}, JSON.stringify(Bun.argv.slice(2)));\n`,
  );

  return { root, script: join(import.meta.dir, 'run-preview.sh') };
}

test('it runs nixie on the routed copy of the config when a host names a model route', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn(['sh', ctx.script, 'serve'], {
    env: {
      PATH: process.env['PATH'] ?? '',
      NIXIE_PREVIEW_ROOT: ctx.root,
      NIXIE_PREVIEW_MODEL_ROUTE: 'preview-a',
    },
    stdout: 'ignore',
    stderr: 'inherit',
  });

  const code = await child.exited;
  const callsText = await readFile(join(ctx.root, 'calls.json'), 'utf8');

  const routedText = await readFile(
    join(ctx.root, 'var', 'lib', 'nixie-preview', 'config.yaml'),
    'utf8',
  );

  const calls: unknown = JSON.parse(callsText);
  const routed: unknown = Bun.YAML.parse(routedText);

  expect(code).toBe(0);

  expect(calls).toStrictEqual([
    'serve',
    '--config',
    `${ctx.root}/var/lib/nixie-preview/config.yaml`,
    '--manifest',
    `${ctx.root}/app/preview/sandbox-manifest.json`,
    '--sops',
    `${ctx.root}/app/preview/run-plain-sops.sh`,
    '--encoder',
    `${ctx.root}/app/node_modules/.cache/nixie-encoder`,
  ]);

  expect(routed).toMatchObject({
    models: { profiles: { preview: { base_url: 'https://api.anthropic.com/preview-a' } } },
  });
});

test('it exits with an error and never runs nixie when the model route is not a slug', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn(['sh', ctx.script, 'serve'], {
    env: {
      PATH: process.env['PATH'] ?? '',
      NIXIE_PREVIEW_ROOT: ctx.root,
      NIXIE_PREVIEW_MODEL_ROUTE: 'Preview A',
    },
    stdout: 'ignore',
    stderr: 'pipe',
  });

  const code = await child.exited;

  const stderr = await new Response(child.stderr).text();

  const ran = await Bun.file(join(ctx.root, 'calls.json')).exists();

  expect(code).not.toBe(0);
  expect(stderr).toInclude("NIXIE_PREVIEW_MODEL_ROUTE must be a lowercase slug, not 'Preview A'");
  expect(ran).toBe(false);
});

test('it runs nixie on the config as it stands when no host names a model route', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn(['sh', ctx.script, 'serve'], {
    env: {
      PATH: process.env['PATH'] ?? '',
      NIXIE_PREVIEW_ROOT: ctx.root,
    },
    stdout: 'ignore',
    stderr: 'inherit',
  });

  const code = await child.exited;
  const callsText = await readFile(join(ctx.root, 'calls.json'), 'utf8');

  const calls: unknown = JSON.parse(callsText);

  expect(code).toBe(0);

  expect(calls).toStrictEqual([
    'serve',
    '--config',
    `${ctx.root}/app/preview/config.yaml`,
    '--manifest',
    `${ctx.root}/app/preview/sandbox-manifest.json`,
    '--sops',
    `${ctx.root}/app/preview/run-plain-sops.sh`,
    '--encoder',
    `${ctx.root}/app/node_modules/.cache/nixie-encoder`,
  ]);
});
