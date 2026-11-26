import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { deviceStore } from '../mocks/device-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import { useDeviceFeed } from './use-device-feed';
import { useWindowPixels } from './use-window-pixels';

interface WindowSize {
  readonly width: number;
  readonly height: number;
}

function setupTest() {
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;

  onTestFinished(() => {
    globalThis.innerWidth = width;
    globalThis.innerHeight = height;
  });

  return {
    mount: () =>
      renderHook(() => {
        const feed = useDeviceFeed();

        useEffect(() => feed.retain(), [feed]);
        useWindowPixels();
      }),
    resizeTo: (next: WindowSize) => {
      globalThis.innerWidth = next.width;
      globalThis.innerHeight = next.height;

      globalThis.dispatchEvent(new Event('resize'));
    },
    readResizes: () =>
      deviceStore.resizes.findMany().map((row) => ({
        width: row.width,
        height: row.height,
        pixelRatio: row.pixelRatio,
      })),
  };
}

test('it reports the size of the window to the device once its stream opens', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.mount();

  await waitFor(() => {
    expect(ctx.readResizes()).toStrictEqual([
      {
        width: Math.round(globalThis.innerWidth * globalThis.devicePixelRatio),
        height: Math.round(globalThis.innerHeight * globalThis.devicePixelRatio),
        pixelRatio: globalThis.devicePixelRatio,
      },
    ]);
  });
});

test('it sends the latest size of the window after a burst of resize events', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.mount();

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(1);
  });

  ctx.resizeTo({ width: 700, height: 500 });
  ctx.resizeTo({ width: 710, height: 510 });

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(2);
  });

  expect(ctx.readResizes().at(-1)).toStrictEqual({
    width: Math.round(710 * globalThis.devicePixelRatio),
    height: Math.round(510 * globalThis.devicePixelRatio),
    pixelRatio: globalThis.devicePixelRatio,
  });
});
