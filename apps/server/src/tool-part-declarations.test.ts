import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { listImageNeeds } from './list-image-needs';
import { loadDeploymentConfig } from './load-deployment-config';
import { loadSandboxManifest } from './load-sandbox-manifest';
import { pickNeededImages } from './pick-needed-images';
import { serverPartDeclarations } from './server-part-declarations';
import type { ServerPartValues } from './server-part-values';
import { buildStubPartReader } from './test-utils/build-stub-part-reader';
import { writeBootFiles } from './test-utils/write-boot-files';
import { toolPartDeclarations } from './tool-part-declarations';
import type { AnyPartDeclaration } from './types';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-tool-parts-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const files = await writeBootFiles(directory, 'http://127.0.0.1:9', { config: [], secrets: [] });
  const config = await loadDeploymentConfig(files.configPath);
  const images = await loadSandboxManifest(files.manifestPath);

  const webFetch = toolPartDeclarations.find((declaration) => declaration.name === 'web_fetch');

  invariant(webFetch !== undefined, 'the tool parts hold a web_fetch part');

  const startWebFetch = (declarations: readonly AnyPartDeclaration<ServerPartValues>[]) => {
    const needs = listImageNeeds(config, declarations);

    const options = {
      sandbox: { adapter: 'test' },
      config,
      images: pickNeededImages(images, needs),
      cleanup: { defer: mock() },
    };

    return webFetch.start(
      buildStubPartReader<ServerPartValues>({
        inputs: { options },
        context: { apiContext: { log: {} } },
        sandbox_adapter: {},
      }),
    );
  };

  return {
    startWebFetch,
    webFetchWithoutImages: { name: webFetch.name, needs: webFetch.needs, start: webFetch.start },
  };
}

test('it starts the web fetch part on the images that the real declarations need', async () => {
  const ctx = await setupTest();
  const started = await ctx.startWebFetch(serverPartDeclarations);

  expect(started).toHaveProperty('tool');
});

test('it fails to start the web fetch part when its declaration names no image', async () => {
  const ctx = await setupTest();

  const others = serverPartDeclarations.filter((declaration) => declaration.name !== 'web_fetch');
  const withoutImages = [...others, ctx.webFetchWithoutImages];

  expect(ctx.startWebFetch(withoutImages)).rejects.toThrow(
    'the sandbox manifest holds no fetch image',
  );
});
