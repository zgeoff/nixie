import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import type { LogFields } from '@heynixie/logger';
import { buildImpSandboxAdapter } from '@heynixie/sandbox-imp';
import { startFakeImp } from '@heynixie/sandbox-imp/test-utils';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { buildCleanup } from './build-cleanup';
import { buildStartState } from './build-start-state';
import { registerSandboxImages } from './register-sandbox-images';
import { runWithRetry } from './run-with-retry';
import { startServerHealth } from './start-server-health';

async function setupTest() {
  const recorder = await setupTestRecorder();
  const imp = await startFakeImp();

  const adapter = buildImpSandboxAdapter({
    port: imp.port,
    recorder: recorder.recorder,
    config: { publicEgress: null },
    toolTarget: () => ({ path: '/nonexistent/tools.sock' }),
  });

  const lines: (LogFields & { readonly event: string })[] = [];

  const log = (event: string, fields?: LogFields) => {
    lines.push({ event, ...fields });
  };

  const state = buildStartState({ isReady: true, reason: null });

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-images-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  onTestFinished(() => writer.stop());

  const clock = buildTestClock(0);
  const cleanup = buildCleanup();

  onTestFinished(() => cleanup.stop());

  const health = await startServerHealth({ writer, state, adapter, dataDir, clock, cleanup, log });

  return {
    imp,
    lines,
    log,
    state,
    tools: { adapter },
    clock,
    cleanup,
    readReadiness: async (): Promise<unknown> => {
      const response = await health.handle(new Request('http://nixie.test/health/ready'));

      return response.json();
    },
  };
}

test('it marks the images added when impd holds each one and refuses every add', async () => {
  const ctx = await setupTest();

  ctx.imp.refuseImageAdd = true;

  ctx.imp.images.set('nixie-conversation-bbbbbbbbbbbb', {
    digest: `sha256:${'b'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}`,
  });

  ctx.imp.images.set('nixie-fetch-cccccccccccc', {
    digest: `sha256:${'c'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-fetch@sha256:${'c'.repeat(64)}`,
  });

  await registerSandboxImages({
    ...ctx,
    images: {
      conversation: {
        name: 'nixie-conversation-bbbbbbbbbbbb',
        ref: `ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}`,
      },
      fetch: {
        name: 'nixie-fetch-cccccccccccc',
        ref: `ghcr.io/example/nixie-fetch@sha256:${'c'.repeat(64)}`,
      },
    },
  });

  expect(ctx.state.read().images).toStrictEqual({ isReady: true, reason: null });
  expect(ctx.imp.calls).toStrictEqual([]);

  expect(ctx.lines).toStrictEqual([
    { event: 'image.added', name: 'nixie-conversation-bbbbbbbbbbbb' },
    { event: 'image.added', name: 'nixie-fetch-cccccccccccc' },
  ]);
});

test('it leaves the images unadded, naming the image, when impd refuses the add of an image it does not hold', async () => {
  const ctx = await setupTest();

  ctx.imp.refuseImageAdd = true;

  ctx.imp.images.set('nixie-conversation-bbbbbbbbbbbb', {
    digest: `sha256:${'b'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}`,
  });

  const refusal = await registerSandboxImages({
    ...ctx,
    images: {
      conversation: {
        name: 'nixie-conversation-bbbbbbbbbbbb',
        ref: `ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}`,
      },
      fetch: {
        name: 'nixie-fetch-cccccccccccc',
        ref: `ghcr.io/example/nixie-fetch@sha256:${'c'.repeat(64)}`,
      },
    },
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toBeInstanceOf(Error);

  expect(refusal).toMatchObject({
    message: expect.stringMatching(/^impd did not add the image nixie-fetch-cccccccccccc from /u),
  });

  expect(ctx.state.read().images).toStrictEqual({
    isReady: false,
    reason: 'impd did not add the image nixie-fetch-cccccccccccc',
  });
});

test('it adds each manifest image to an impd that holds none, and reports the imp host ready', async () => {
  const ctx = await setupTest();

  await runWithRetry(
    () =>
      registerSandboxImages({
        ...ctx,
        images: {
          conversation: {
            name: 'nixie-conversation-bbbbbbbbbbbb',
            ref: `ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}`,
          },
          fetch: {
            name: 'nixie-fetch-cccccccccccc',
            ref: `ghcr.io/example/nixie-fetch@sha256:${'c'.repeat(64)}`,
          },
        },
      }),
    { step: 'add_images', signal: ctx.cleanup.signal, log: ctx.log, clock: ctx.clock },
  );

  await waitForCondition(async () => {
    const body = await ctx.readReadiness();

    return JSON.stringify(body).includes('"imp_host":{"isReady":true');
  });

  expect(ctx.imp.calls).toStrictEqual([
    `image nixie-conversation-bbbbbbbbbbbb ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}`,
    `image nixie-fetch-cccccccccccc ghcr.io/example/nixie-fetch@sha256:${'c'.repeat(64)}`,
  ]);

  expect([...ctx.imp.images]).toStrictEqual([
    [
      'nixie-conversation-bbbbbbbbbbbb',
      {
        digest: `sha256:${'b'.repeat(64)}`,
        ref: `ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}`,
      },
    ],
    [
      'nixie-fetch-cccccccccccc',
      {
        digest: `sha256:${'c'.repeat(64)}`,
        ref: `ghcr.io/example/nixie-fetch@sha256:${'c'.repeat(64)}`,
      },
    ],
  ]);

  expect(ctx.readReadiness()).resolves.toMatchObject({
    dependencies: { imp_host: { isReady: true, reason: null } },
  });
});

test('it reports the imp host unready, naming the image impd refused to add, and logs the refusal, until a retry adds it', async () => {
  const ctx = await setupTest();

  ctx.imp.refuseImageAdd = true;

  const added = runWithRetry(
    () =>
      registerSandboxImages({
        ...ctx,
        images: {
          conversation: {
            name: 'nixie-conversation-bbbbbbbbbbbb',
            ref: `ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}`,
          },
          fetch: {
            name: 'nixie-fetch-cccccccccccc',
            ref: `ghcr.io/example/nixie-fetch@sha256:${'c'.repeat(64)}`,
          },
        },
      }),
    { step: 'add_images', signal: ctx.cleanup.signal, log: ctx.log, clock: ctx.clock },
  );

  await waitForCondition(async () => {
    const body = await ctx.readReadiness();

    return JSON.stringify(body).includes('impd did not add the image');
  });

  const refused = await ctx.readReadiness();

  ctx.imp.refuseImageAdd = false;

  await waitForCondition(() => {
    ctx.clock.advance(1000);

    return ctx.state.read().images.isReady;
  });

  await added;

  await waitForCondition(async () => {
    const body = await ctx.readReadiness();

    return JSON.stringify(body).includes('"imp_host":{"isReady":true');
  });

  expect(refused).toMatchObject({
    dependencies: {
      imp_host: {
        isReady: false,
        reason: 'impd did not add the image nixie-conversation-bbbbbbbbbbbb',
      },
    },
  });

  expect(ctx.lines).toPartiallyContain({
    event: 'start.retry',
    step: 'add_images',
    message: `impd did not add the image nixie-conversation-bbbbbbbbbbbb from ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}: token nixie-test is limited to some imps; this call is host-wide`,
  });

  expect(ctx.readReadiness()).resolves.toMatchObject({
    dependencies: { imp_host: { isReady: true, reason: null } },
  });
});
