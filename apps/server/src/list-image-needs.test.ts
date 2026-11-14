import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listImageNeeds } from './list-image-needs';
import { loadDeploymentConfig } from './load-deployment-config';
import { serverPartDeclarations } from './server-part-declarations';
import { writeBootFiles } from './test-utils/write-boot-files';
import type { BootFileExtras } from './test-utils/write-boot-files';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-image-needs-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    loadConfig: async (extras: Partial<BootFileExtras>) => {
      const files = await writeBootFiles(directory, 'http://127.0.0.1:9', {
        config: [],
        secrets: [],
        ...extras,
      });

      return loadDeploymentConfig(files.configPath);
    },
  };
}

test('it needs the image of a role profile once, however many roles fall back to it', async () => {
  const ctx = await setupTest();
  const config = await ctx.loadConfig({});

  expect(listImageNeeds(config, [])).toStrictEqual([
    { key: 'conversation', neededBy: 'the profile scripted on the agent-sdk harness' },
  ]);
});

test('it needs the image of the profile that a role names', async () => {
  const ctx = await setupTest();
  const config = await ctx.loadConfig({ roleModelURLs: { checker: 'http://127.0.0.1:9' } });

  expect(listImageNeeds(config, [])).toStrictEqual([
    { key: 'conversation', neededBy: 'the profile scripted on the agent-sdk harness' },
    { key: 'conversation', neededBy: 'the profile scripted-checker on the agent-sdk harness' },
  ]);
});

test('it needs the image of a selectable profile', async () => {
  const ctx = await setupTest();
  const config = await ctx.loadConfig({ selectableModelURLs: { sonnet: 'http://127.0.0.1:9' } });

  expect(listImageNeeds(config, [])).toStrictEqual([
    { key: 'conversation', neededBy: 'the profile scripted on the agent-sdk harness' },
    { key: 'conversation', neededBy: 'the profile selectable-sonnet on the agent-sdk harness' },
  ]);
});

test('it needs each image that a declaration names', async () => {
  const ctx = await setupTest();
  const config = await ctx.loadConfig({});

  expect(listImageNeeds(config, serverPartDeclarations)).toStrictEqual([
    { key: 'conversation', neededBy: 'the profile scripted on the agent-sdk harness' },
    { key: 'fetch', neededBy: 'the web_fetch part' },
  ]);
});

test('it needs no image for a declaration that names none', async () => {
  const ctx = await setupTest();
  const config = await ctx.loadConfig({});

  const declarations = serverPartDeclarations.filter(
    (declaration) => declaration.name !== 'web_fetch',
  );

  expect(listImageNeeds(config, declarations)).toStrictEqual([
    { key: 'conversation', neededBy: 'the profile scripted on the agent-sdk harness' },
  ]);
});
