import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubSandboxes, setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildCleanup } from './build-cleanup';
import { listImageNeeds } from './list-image-needs';
import { loadDeploymentConfig } from './load-deployment-config';
import { loadSandboxManifest } from './load-sandbox-manifest';
import { pickNeededImages } from './pick-needed-images';
import { serverPartDeclarations } from './server-part-declarations';
import type { ServerPartValues } from './server-part-values';
import { startWebFetchPart } from './start-web-fetch-part';
import { createTestClient } from './test-utils/create-test-client';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';
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

  const sandboxes = buildStubSandboxes();
  const cleanup = buildCleanup();

  // onTestFinished runs its callbacks first in, first out, so the web fetch stops while the
  // recorder's writer still runs.
  onTestFinished(() => cleanup.stop());

  const testRecorder = await setupTestRecorder();

  const startWebFetch = (declarations: readonly AnyPartDeclaration<ServerPartValues>[]) =>
    startWebFetchPart({
      options: {
        sandbox: { adapter: 'test' },
        config,
        images: pickNeededImages(images, listImageNeeds(config, declarations)),
        cleanup,
      },
      adapter: sandboxes.adapter,
      log: testRecorder.log,
    });

  return {
    sandboxes,
    fetchImageName: images.fetch?.name,
    startWebFetch,
    webFetchWithoutImages: { name: webFetch.name, needs: webFetch.needs, start: webFetch.start },
  };
}

test('it creates the fetch sandbox from the fetch image that the real declarations pick', async () => {
  const ctx = await setupTest();
  const started = await ctx.startWebFetch(serverPartDeclarations);

  invariant(ctx.fetchImageName !== undefined, 'the test manifest holds a fetch image');

  await started.readSkillPage('https://example.com/skills/SKILL.md').catch(() => null);

  expect(ctx.sandboxes.created.map((spec) => [spec.kind, spec.image])).toStrictEqual([
    ['fetch', ctx.fetchImageName],
  ]);
});

test('it fails to start the web fetch part when its declaration names no image', async () => {
  const ctx = await setupTest();

  const others = serverPartDeclarations.filter((declaration) => declaration.name !== 'web_fetch');
  const withoutImages = [...others, ctx.webFetchWithoutImages];

  await expect(ctx.startWebFetch(withoutImages)).rejects.toThrow(
    'the sandbox manifest holds no fetch image',
  );
});

test('it offers prompt_read and prompt_write to the conversation guest when the definitions export is configured', async () => {
  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export: { repository: harbour/definitions, api_url: "https://127.0.0.1:9" }',
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const api = await createTestClient(nixie);

  const gate = Promise.withResolvers<void>();

  nixie.guest.addReplies({ text: 'Hello.', gate: () => gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(() => nixie.guest.turns.length === 1);

  const [received] = nixie.guest.received;

  invariant(received);

  const names = await nixie.readToolNames(received);

  gate.resolve();

  expect(names).toIncludeAllMembers(['prompt_read', 'prompt_write']);
});

test('it offers prompt_read alone to the conversation guest when no definitions export is configured', async () => {
  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);

  const gate = Promise.withResolvers<void>();

  nixie.guest.addReplies({ text: 'Hello.', gate: () => gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(() => nixie.guest.turns.length === 1);

  const [received] = nixie.guest.received;

  invariant(received);

  const names = await nixie.readToolNames(received);

  gate.resolve();

  expect(names).toContain('prompt_read');
  expect(names).not.toContain('prompt_write');
});
