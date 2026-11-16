import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCodexHome } from './write-codex-home';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-codex-home-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  return {
    home,
    writeHome: () =>
      writeCodexHome(home, {
        model: 'gpt-test-1',
        effort: 'medium',
        baseURL: 'https://models.example.test/v1',
        toolsURL: 'http://127.0.0.1:8901/mcp',
        toolCallWaitMs: null,
      }),
  };
}

test('it writes the config and a catalog that the config names', async () => {
  const ctx = await setupTest();

  await ctx.writeHome();

  const config = await readFile(join(ctx.home, '.codex', 'config.toml'), 'utf8');

  const catalogPath = join(ctx.home, '.codex', 'model-catalog.json');

  const catalogText = await readFile(catalogPath, 'utf8');

  expect(config.split('\n')).toContain(`model_catalog_json = "${catalogPath}"`);

  expect(JSON.parse(catalogText)).toStrictEqual({
    models: [expect.objectContaining({ slug: 'gpt-test-1' })],
  });
});

test('it gives the working directory an empty git repository with no remote', async () => {
  const ctx = await setupTest();

  await ctx.writeHome();

  const workDir = join(ctx.home, 'codex-work');

  const head = await readFile(join(workDir, '.git', 'HEAD'), 'utf8');
  const gitConfig = await readFile(join(workDir, '.git', 'config'), 'utf8');
  const branches = await readdir(join(workDir, '.git', 'refs', 'heads'));

  expect([head, gitConfig.includes('remote'), branches]).toStrictEqual([
    'ref: refs/heads/main\n',
    false,
    [],
  ]);
});
