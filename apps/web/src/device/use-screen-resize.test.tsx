import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { RefObject } from 'react';
import { deviceStore } from '../mocks/device-store';
import { server } from '../mocks/server';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import type { ScreenPixels } from './read-screen-pixels';
import { readScreenPixels } from './read-screen-pixels';
import { useScreenResize } from './use-screen-resize';

function setupTest() {
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;

  onTestFinished(() => {
    globalThis.innerWidth = width;
    globalThis.innerHeight = height;
  });

  return {
    buildServerPixels: (pixels: ScreenPixels): RefObject<ScreenPixels> => ({ current: pixels }),
    resizeTo: (next: Pick<ScreenPixels, 'width' | 'height'>) => {
      globalThis.innerWidth = next.width;
      globalThis.innerHeight = next.height;

      globalThis.dispatchEvent(new Event('resize'));
    },
    readResizes: () =>
      deviceStore.resizes
        .findMany()
        .map((row) => ({ width: row.width, height: row.height, pixelRatio: row.pixelRatio })),
  };
}

test('it sends one resize with the latest size after a burst of resize events', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const serverPixels = ctx.buildServerPixels({ width: 1, height: 1, pixelRatio: 1 });

  renderHook(() => {
    useScreenResize(true, serverPixels);
  });

  ctx.resizeTo({ width: 700, height: 500 });
  ctx.resizeTo({ width: 710, height: 510 });

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(1);
  });

  expect(ctx.readResizes()).toStrictEqual([
    {
      width: Math.round(710 * globalThis.devicePixelRatio),
      height: Math.round(510 * globalThis.devicePixelRatio),
      pixelRatio: globalThis.devicePixelRatio,
    },
  ]);
});

test('it sends the size again when a reconnect left the server with another size', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const serverPixels = ctx.buildServerPixels(readScreenPixels());

  renderHook(() => {
    useScreenResize(true, serverPixels);
  });

  serverPixels.current = { width: 640, height: 480, pixelRatio: 1 };

  ctx.resizeTo({ width: globalThis.innerWidth, height: globalThis.innerHeight });

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(1);
  });

  expect(ctx.readResizes()).toStrictEqual([readScreenPixels()]);
});

test('it sends the size again on the next resize event after a failed resize', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const failures: string[] = [];

  server.use(
    http.post(
      '*/rpc/devices/resize',
      () => {
        failures.push('resize');

        return HttpResponse.error();
      },
      { once: true },
    ),
  );

  const serverPixels = ctx.buildServerPixels({ width: 1, height: 1, pixelRatio: 1 });

  renderHook(() => {
    useScreenResize(true, serverPixels);
  });

  ctx.resizeTo({ width: 700, height: 500 });

  await waitFor(() => {
    expect(failures).toHaveLength(1);
  });

  ctx.resizeTo({ width: 700, height: 500 });

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(1);
  });

  expect(serverPixels.current).toStrictEqual(readScreenPixels());
});

test('it sends the size again when a reconnect changed the size of the server while a resize was in flight', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const held = Promise.withResolvers<void>();
  const received: string[] = [];

  server.use(
    http.post(
      '*/rpc/devices/resize',
      async () => {
        received.push('resize');

        await held.promise;
      },
      { once: true },
    ),
  );

  const serverPixels = ctx.buildServerPixels({ width: 1, height: 1, pixelRatio: 1 });

  renderHook(() => {
    useScreenResize(true, serverPixels);
  });

  ctx.resizeTo({ width: 700, height: 500 });

  await waitFor(() => {
    expect(received).toHaveLength(1);
  });

  serverPixels.current = { width: 1024, height: 768, pixelRatio: 1 };

  ctx.resizeTo({ width: 700, height: 500 });

  const resizedAtMs = performance.now();

  await waitFor(() => {
    expect(performance.now() - resizedAtMs).toBeGreaterThan(300);
  });

  held.resolve();

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(2);
  });

  expect(serverPixels.current).toStrictEqual(readScreenPixels());
});

test('it sends the size again when a resize event arrived while a failing resize was in flight', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const held = Promise.withResolvers<void>();
  const received: string[] = [];

  server.use(
    http.post(
      '*/rpc/devices/resize',
      async () => {
        received.push('resize');

        await held.promise;

        return HttpResponse.error();
      },
      { once: true },
    ),
  );

  const serverPixels = ctx.buildServerPixels({ width: 1, height: 1, pixelRatio: 1 });

  renderHook(() => {
    useScreenResize(true, serverPixels);
  });

  ctx.resizeTo({ width: 700, height: 500 });

  await waitFor(() => {
    expect(received).toHaveLength(1);
  });

  ctx.resizeTo({ width: 700, height: 500 });

  const resizedAtMs = performance.now();

  await waitFor(() => {
    expect(performance.now() - resizedAtMs).toBeGreaterThan(300);
  });

  held.resolve();

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(1);
  });

  expect(serverPixels.current).toStrictEqual(readScreenPixels());
});
