import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { renderHook } from '../test-utils/render-hook';
import { useWakeLock } from './use-wake-lock';

function setupTest() {
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'wakeLock');
  const release = mock(() => Promise.resolve());
  const sentinel = { released: false, release };
  const request = mock(() => Promise.resolve(sentinel));

  Object.defineProperty(globalThis.navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  });

  onTestFinished(() => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis.navigator, 'wakeLock');
    } else {
      Object.defineProperty(globalThis.navigator, 'wakeLock', original);
    }
  });

  return { release, request, sentinel };
}

test('it asks for a screen wake lock while the device shows something', async () => {
  const ctx = setupTest();

  renderHook(() => {
    useWakeLock(true);
  });

  await waitFor(() => {
    expect(ctx.request).toHaveBeenCalledWith('screen');
  });
});

test('it asks for no wake lock while nothing shows', () => {
  const ctx = setupTest();

  renderHook(() => {
    useWakeLock(false);
  });

  expect(ctx.request).not.toHaveBeenCalled();
});

test('it asks again when the page shows again, because the browser drops the lock when it hides', async () => {
  const ctx = setupTest();

  renderHook(() => {
    useWakeLock(true);
  });

  await waitFor(() => {
    expect(ctx.request).toHaveBeenCalledOnce();
  });

  ctx.sentinel.released = true;

  globalThis.document.dispatchEvent(new Event('visibilitychange'));

  await waitFor(() => {
    expect(ctx.request).toHaveBeenCalledTimes(2);
  });
});

test('it releases the lock when the device stops showing', async () => {
  const ctx = setupTest();

  const rendered = renderHook(() => {
    useWakeLock(true);
  });

  await waitFor(() => {
    expect(ctx.request).toHaveBeenCalledOnce();
  });

  rendered.unmount();

  await waitFor(() => {
    expect(ctx.release).toHaveBeenCalledOnce();
  });
});
