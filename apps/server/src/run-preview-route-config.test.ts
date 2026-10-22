import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'preview-route-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    entry: join(import.meta.dir, 'run-preview-route-config.ts'),
    previewConfig: join(import.meta.dir, '..', '..', '..', 'preview', 'config.yaml'),
  };
}

test("it writes a copy of the preview's own config with the route on its model base URL", async () => {
  const ctx = await setupTest();

  const child = Bun.spawn(
    [
      process.execPath,
      '--define',
      'NIXIE_TEST_BUILD=true',
      ctx.entry,
      '--route',
      'preview-a',
      '--source',
      ctx.previewConfig,
      '--target',
      join(ctx.directory, 'config.yaml'),
    ],
    { stdout: 'ignore', stderr: 'pipe' },
  );

  const code = await child.exited;
  const written = await readFile(join(ctx.directory, 'config.yaml'), 'utf8');

  expect(code).toBe(0);

  expect(Bun.YAML.parse(written)).toMatchObject({
    models: { profiles: { preview: { base_url: 'https://api.anthropic.com/preview-a' } } },
  });
});

test('it exits 1 for a route that is not a slug and writes no copy', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn(
    [
      process.execPath,
      '--define',
      'NIXIE_TEST_BUILD=true',
      ctx.entry,
      '--route',
      'Preview-A',
      '--source',
      ctx.previewConfig,
      '--target',
      join(ctx.directory, 'config.yaml'),
    ],
    { stdout: 'ignore', stderr: 'pipe' },
  );

  const code = await child.exited;
  const stderr = await child.stderr.text();
  const written = await Bun.file(join(ctx.directory, 'config.yaml')).exists();

  expect(code).toBe(1);
  expect(stderr).toBe("NIXIE_PREVIEW_MODEL_ROUTE must be a lowercase slug, not 'Preview-A'\n");
  expect(written).toBeFalse();
});
