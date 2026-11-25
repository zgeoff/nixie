import { expect, onTestFinished, test } from 'bun:test';
import type { RenderRequest } from '@heynixie/wire';
import { buildMockRenderRequest } from '@heynixie/wire/test-utils';
import type { StubGuest } from '../test-utils/build-stub-sandbox-adapter';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { makeStubRenderer } from '../test-utils/make-stub-renderer';
import { startRenderSandbox } from './start-render-sandbox';

function setupTest(guest: StubGuest) {
  const adapter = buildStubSandboxAdapter(guest);

  const sandbox = startRenderSandbox({
    adapter,
    image: 'nixie-render',
    argv: ['bun', '/app/render.js'],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  onTestFinished(() => sandbox.stop());

  return { adapter, sandbox };
}

test('it sends the render guest the request and returns the picture it draws', async () => {
  const received: RenderRequest[] = [];

  const ctx = setupTest(
    makeStubRenderer(() => ({ kind: 'picture', base64: 'AQID', refused: ['http://x/'] }), received),
  );

  const request = buildMockRenderRequest({ width: 936, height: 702, pixelRatio: 2 });

  const outcome = await ctx.sandbox.draw(request);

  expect({ outcome, received }).toStrictEqual({
    outcome: { kind: 'picture', png: new Uint8Array([1, 2, 3]), refused: ['http://x/'] },
    received: [request],
  });
});

test('it creates a render sandbox with no network, no grants and no tool route, and destroys it', async () => {
  const ctx = setupTest(makeStubRenderer(() => ({ kind: 'picture', base64: '', refused: [] })));

  await ctx.sandbox.draw(buildMockRenderRequest());

  expect({ created: ctx.adapter.created, destroyed: ctx.adapter.destroyed.length }).toStrictEqual({
    created: [
      {
        id: expect.toBeString(),
        spec: {
          kind: 'render',
          image: 'nixie-render',
          owner: 'device_render',
          egress: { kind: 'none' },
          grants: [],
          toolRoute: false,
          limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
        },
      },
    ],
    destroyed: 1,
  });
});

test('it runs two renders one after the other, each in a sandbox of its own', async () => {
  const ctx = setupTest(makeStubRenderer(() => ({ kind: 'picture', base64: '', refused: [] })));

  await Promise.all([
    ctx.sandbox.draw(buildMockRenderRequest()),
    ctx.sandbox.draw(buildMockRenderRequest()),
  ]);

  expect({
    created: ctx.adapter.created.length,
    mostLive: ctx.adapter.countMostLive(),
  }).toStrictEqual({ created: 2, mostLive: 1 });
});

test('it returns the reason of a render that the guest failed', async () => {
  const ctx = setupTest(makeStubRenderer(() => ({ kind: 'failed', reason: 'no browser' })));

  const outcome = await ctx.sandbox.draw(buildMockRenderRequest());

  expect(outcome).toStrictEqual({ kind: 'failed', reason: 'no browser' });
});

test('it fails a render whose guest exits with no reply', async () => {
  const ctx = setupTest(() => Promise.resolve(1));

  const outcome = await ctx.sandbox.draw(buildMockRenderRequest());

  expect(outcome.kind).toBe('failed');
});

test('it fails a render once it is stopped', async () => {
  const ctx = setupTest(makeStubRenderer(() => ({ kind: 'picture', base64: '', refused: [] })));

  await ctx.sandbox.stop();

  const outcome = await ctx.sandbox.draw(buildMockRenderRequest());

  expect(outcome).toStrictEqual({ kind: 'failed', reason: 'the render sandbox is stopped' });
});
