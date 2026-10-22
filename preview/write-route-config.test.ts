import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'route-config-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    script: join(import.meta.dir, 'write-route-config.sh'),
    previewConfig: join(import.meta.dir, 'config.yaml'),
  };
}

test('it writes the preview config with its model base URL ending in the route', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn(
    [ctx.script, 'preview-a', ctx.previewConfig, join(ctx.directory, 'config.yaml')],
    { stdout: 'ignore', stderr: 'pipe' },
  );

  const code = await child.exited;
  const written = await readFile(join(ctx.directory, 'config.yaml'), 'utf8');
  const original = await readFile(ctx.previewConfig, 'utf8');

  expect(code).toBe(0);

  expect(written).toBe(
    original.replace(
      '      base_url: https://api.anthropic.com\n',
      '      base_url: https://api.anthropic.com/preview-a\n',
    ),
  );

  expect(written).toInclude('base_url: https://api.anthropic.com/preview-a\n');
});

test.each(['Preview-A', 'preview/a', '-preview', 'preview a'])(
  'it refuses the route %p and writes no config',
  async (route) => {
    const ctx = await setupTest();

    const child = Bun.spawn(
      [ctx.script, route, ctx.previewConfig, join(ctx.directory, 'config.yaml')],
      { stdout: 'ignore', stderr: 'pipe' },
    );

    const code = await child.exited;
    const stderr = await child.stderr.text();
    const written = await Bun.file(join(ctx.directory, 'config.yaml')).exists();

    expect(code).toBe(1);
    expect(stderr).toInclude('NIXIE_PREVIEW_MODEL_ROUTE must be a lowercase slug');
    expect(written).toBeFalse();
  },
);

test('it refuses a config with no model base URL to put the route on', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'source.yaml'), 'models:\n  main:\n    model: model-small\n');

  const child = Bun.spawn(
    [
      ctx.script,
      'preview-a',
      join(ctx.directory, 'source.yaml'),
      join(ctx.directory, 'config.yaml'),
    ],
    { stdout: 'ignore', stderr: 'pipe' },
  );

  const code = await child.exited;
  const stderr = await child.stderr.text();
  const written = await Bun.file(join(ctx.directory, 'config.yaml')).exists();

  expect(code).toBe(1);
  expect(stderr).toInclude('the preview config has no model base URL to put the route on');
  expect(written).toBeFalse();
});
