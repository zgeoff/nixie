import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { deviceStore } from '../mocks/device-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import type { ScreenPixels } from './read-screen-pixels';
import { useScreenResize } from './use-screen-resize';

function setupTest() {
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;

  onTestFinished(() => {
    globalThis.innerWidth = width;
    globalThis.innerHeight = height;
  });

  return {
    resizeTo: (next: ScreenPixels) => {
      globalThis.innerWidth = next.width;
      globalThis.innerHeight = next.height;

      globalThis.dispatchEvent(new Event('resize'));
    },
    readResizes: () =>
      deviceStore.resizes.findMany().map((row) => ({ width: row.width, height: row.height })),
  };
}

test('it sends one resize with the latest size after a burst of resize events', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  renderHook(() => {
    useScreenResize(true);
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
    },
  ]);
});
