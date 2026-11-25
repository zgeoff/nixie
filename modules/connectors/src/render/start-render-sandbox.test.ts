import { expect, test } from 'bun:test';
import type { RenderRequest } from '@heynixie/wire';
import { buildMockRenderRequest } from '@heynixie/wire/test-utils';
import { createFakeClock, runClockUntil } from '@zgeoff/testing/clock';
import { makeStubRenderer } from '../test-utils/make-stub-renderer';
import { startTestRenderSandbox } from '../test-utils/start-test-render-sandbox';

test('it sends the render guest the request and returns the picture it draws', async () => {
  const received: RenderRequest[] = [];

  const ctx = startTestRenderSandbox(
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
  const ctx = startTestRenderSandbox(
    makeStubRenderer(() => ({ kind: 'picture', base64: '', refused: [] })),
  );

  await ctx.sandbox.draw(buildMockRenderRequest());

  expect({ created: ctx.adapter.created, destroyed: ctx.adapter.destroyed.length }).toStrictEqual({
    created: [
      {
        id: expect.toBeString(),
        spec: {
          kind: 'code_run',
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
  const ctx = startTestRenderSandbox(
    makeStubRenderer(() => ({ kind: 'picture', base64: '', refused: [] })),
  );

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
  const ctx = startTestRenderSandbox(
    makeStubRenderer(() => ({ kind: 'failed', reason: 'no browser' })),
  );

  const outcome = await ctx.sandbox.draw(buildMockRenderRequest());

  expect(outcome).toStrictEqual({ kind: 'failed', reason: 'no browser' });
});

test('it fails a render whose guest exits with no reply', async () => {
  const ctx = startTestRenderSandbox(() => Promise.resolve(1));

  const outcome = await ctx.sandbox.draw(buildMockRenderRequest());

  expect(outcome.kind).toBe('failed');
});

test('it fails a render once it is stopped', async () => {
  const ctx = startTestRenderSandbox(
    makeStubRenderer(() => ({ kind: 'picture', base64: '', refused: [] })),
  );

  await ctx.sandbox.stop();

  const outcome = await ctx.sandbox.draw(buildMockRenderRequest());

  expect(outcome).toStrictEqual({ kind: 'failed', reason: 'the render sandbox is stopped' });
});

test('it destroys the sandbox of a render whose guest ignores its stop, and goes on to the next', async () => {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const ctx = startTestRenderSandbox(() => Promise.withResolvers<number>().promise, {
    adapter: { isStopIgnored: true },
    render: { clock, renderTimeoutMs: 60_000 },
  });

  const outcomes: string[] = [];

  const drawOne = async () => {
    const outcome = await ctx.sandbox.draw(buildMockRenderRequest());

    outcomes.push(outcome.kind);
  };

  const drawn = Promise.all([drawOne(), drawOne()]);

  await runClockUntil(clock, () => outcomes.length === 2, { maxMs: 600_000 });
  await drawn;

  expect({
    outcomes,
    created: ctx.adapter.created.length,
    destroyed: ctx.adapter.destroyed.length,
  }).toStrictEqual({ outcomes: ['failed', 'failed'], created: 2, destroyed: 2 });
});
