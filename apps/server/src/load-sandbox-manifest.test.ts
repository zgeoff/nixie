import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSandboxManifest } from './load-sandbox-manifest';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-manifest-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'sandbox-manifest.json') };
}

test('it names each image by its kind and the head of its digest', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({
      conversation: `ghcr.io/example/nixie-conversation@sha256:${'0123456789ab'.repeat(5)}0123`,
      fetch: `ghcr.io/example/nixie-fetch@sha256:${'f'.repeat(64)}`,
    }),
  );

  const images = await loadSandboxManifest(ctx.path);

  expect(images).toStrictEqual({
    conversation: {
      name: 'nixie-conversation-0123456789ab',
      ref: `ghcr.io/example/nixie-conversation@sha256:${'0123456789ab'.repeat(5)}0123`,
    },
    fetch: {
      name: 'nixie-fetch-ffffffffffff',
      ref: `ghcr.io/example/nixie-fetch@sha256:${'f'.repeat(64)}`,
    },
  });
});

test('it refuses an image pinned by tag alone', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({
      conversation: `ghcr.io/example/nixie-conversation@sha256:${'a'.repeat(64)}`,
      fetch: 'ghcr.io/example/nixie-fetch:0.1.0',
    }),
  );

  expect(loadSandboxManifest(ctx.path)).rejects.toThrow(
    `nixie refuses the sandbox manifest in ${ctx.path}:\nfetch: an image reference pinned by digest`,
  );
});

test('it refuses a manifest without the fetch image', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({ conversation: `ghcr.io/example/nixie-conversation@sha256:${'a'.repeat(64)}` }),
  );

  expect(loadSandboxManifest(ctx.path)).rejects.toThrow('fetch:');
});
