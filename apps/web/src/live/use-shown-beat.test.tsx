import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/server';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import { shownBeatMs, useShownBeat } from './use-shown-beat';

function setupTest() {
  const beats = mock<() => void>();

  server.use(
    http.post('*/rpc/sessions/shown', () => {
      beats();

      return HttpResponse.json({ json: {} });
    }),
  );

  return {
    beats,
    timer: buildStubTimer(),
    setVisibility: (state: 'visible' | 'hidden') => {
      Object.defineProperty(globalThis.document, 'visibilityState', {
        configurable: true,
        get: () => state,
      });

      onTestFinished(() => {
        Reflect.deleteProperty(globalThis.document, 'visibilityState');
      });
    },
  };
}

test('it calls sessions.shown when a visible page mounts', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  renderHook(() => {
    useShownBeat(ctx.timer.startTimer);
  });

  await waitFor(() => {
    expect(ctx.beats).toHaveBeenCalledOnce();
  });
});

test('it calls sessions.shown again each minute while the page stays visible', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  renderHook(() => {
    useShownBeat(ctx.timer.startTimer);
  });

  await waitFor(() => {
    expect(ctx.beats).toHaveBeenCalledOnce();
  });

  const delayMs = await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(ctx.beats).toHaveBeenCalledTimes(2);
  });

  expect(delayMs).toBe(shownBeatMs);
});

test('it never calls sessions.shown from a page that is hidden', async () => {
  const ctx = setupTest();

  ctx.setVisibility('hidden');

  await createDeviceSession();

  renderHook(() => {
    useShownBeat(ctx.timer.startTimer);
  });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(0);
  });

  expect(ctx.beats).not.toHaveBeenCalled();
});

test('it calls sessions.shown when a hidden page becomes visible', async () => {
  const ctx = setupTest();

  ctx.setVisibility('hidden');

  await createDeviceSession();

  renderHook(() => {
    useShownBeat(ctx.timer.startTimer);
  });

  ctx.setVisibility('visible');
  globalThis.document.dispatchEvent(new Event('visibilitychange'));

  await waitFor(() => {
    expect(ctx.beats).toHaveBeenCalledOnce();
  });
});
