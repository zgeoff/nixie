import { expect, test } from 'bun:test';
import type { LogFields } from '@heynixie/ops';
import { buildImpSandboxAdapter } from '@heynixie/sandbox-imp';
import { startFakeImp } from '@heynixie/sandbox-imp/test-utils';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { buildStartState } from './build-start-state';
import { registerSandboxImages } from './register-sandbox-images';

// The imp adapter on a fake impd and a fresh recorder, with the start state the step reports to.
// The step adds images only, so the tool target is never reached.
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

  return {
    imp,
    lines,
    state: buildStartState({ isReady: true, reason: null }),
    tools: { adapter },
    log: (event: string, fields?: LogFields) => {
      lines.push({ event, ...fields });
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

  expect(ctx.state.read().areImagesAdded).toBe(true);
  expect(ctx.imp.calls).toStrictEqual([]);
  expect(ctx.lines).toStrictEqual([
    { event: 'image.added', name: 'nixie-conversation-bbbbbbbbbbbb' },
    { event: 'image.added', name: 'nixie-fetch-cccccccccccc' },
  ]);
});

test('it leaves the images unadded when impd refuses the add of an image it does not hold', async () => {
  const ctx = await setupTest();

  ctx.imp.refuseImageAdd = true;
  ctx.imp.images.set('nixie-conversation-bbbbbbbbbbbb', {
    digest: `sha256:${'b'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-conversation@sha256:${'b'.repeat(64)}`,
  });

  expect(
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
  ).rejects.toThrowWithMessage(
    Error,
    /^impd did not add the image nixie-fetch-cccccccccccc from /u,
  );
  expect(ctx.state.read().areImagesAdded).toBe(false);
});
