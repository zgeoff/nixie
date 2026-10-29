import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli } from 'gunshi';
import { previewRouteCommand } from './preview-route-command';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'preview-route-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    previewConfig: join(import.meta.dir, '..', '..', '..', 'preview', 'config.yaml'),
  };
}

test("it writes a copy of the preview's own config with the route on its model base URL", async () => {
  const ctx = await setupTest();

  await cli(
    [
      '--route',
      'preview-a',
      '--source',
      ctx.previewConfig,
      '--target',
      join(ctx.directory, 'config.yaml'),
    ],
    previewRouteCommand,
  );

  const written = await readFile(join(ctx.directory, 'config.yaml'), 'utf8');

  expect(Bun.YAML.parse(written)).toMatchObject({
    models: { profiles: { preview: { base_url: 'https://api.anthropic.com/preview-a' } } },
  });
});

test('it refuses a route that is not a slug and writes no copy', async () => {
  const ctx = await setupTest();

  const run = cli(
    [
      '--route',
      'Preview-A',
      '--source',
      ctx.previewConfig,
      '--target',
      join(ctx.directory, 'config.yaml'),
    ],
    previewRouteCommand,
  );

  expect(run).rejects.toThrowWithMessage(
    Error,
    "NIXIE_PREVIEW_MODEL_ROUTE must be a lowercase slug, not 'Preview-A'",
  );

  const isWritten = await Bun.file(join(ctx.directory, 'config.yaml')).exists();

  expect(isWritten).toBeFalse();
});
