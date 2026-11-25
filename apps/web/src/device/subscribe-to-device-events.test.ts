import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { buildBrowserClient } from '../client/build-browser-client';
import { server } from '../mocks/server';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { subscribeToDeviceEvents } from './subscribe-to-device-events';

interface Handlers {
  readonly onConnection: (state: 'open' | 'lost' | 'refused') => void;
  readonly onEvent: () => void;
}

function setupTest() {
  const following = new AbortController();

  onTestFinished(() => {
    following.abort();
  });

  const timer = buildStubTimer();

  return {
    onConnection: mock<(state: 'open' | 'lost' | 'refused') => void>(),
    onEvent: mock<() => void>(),
    signal: following.signal,
    timer,
    subscribe: (handlers: Handlers) =>
      subscribeToDeviceEvents({
        client: buildBrowserClient(),
        readPixels: () => ({ width: 1920, height: 480, pixelRatio: 1 }),
        onConnection: handlers.onConnection,
        onEvent: handlers.onEvent,
        signal: following.signal,
        startTimer: timer.startTimer,
      }),
  };
}

test('it delivers what the screen shows when the stream opens', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  void ctx.subscribe({ onConnection: ctx.onConnection, onEvent: ctx.onEvent });

  await waitFor(() => {
    expect(ctx.onEvent).toHaveBeenCalledWith({
      kind: 'idle',
      scene: [{ kind: 'markdown', text: '# Saturday' }],
    });
  });

  expect(ctx.onConnection).toHaveBeenCalledWith('open');
});

test('it stops when the API refuses the session', async () => {
  const ctx = setupTest();

  await ctx.subscribe({ onConnection: ctx.onConnection, onEvent: ctx.onEvent });

  expect(ctx.onConnection.mock.calls).toStrictEqual([['refused']]);
});

test('it opens the stream again after a break, with a pause that doubles', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/live/follow', () => HttpResponse.error()));
  void ctx.subscribe({ onConnection: ctx.onConnection, onEvent: ctx.onEvent });

  const first = await ctx.timer.advanceToNext();
  const second = await ctx.timer.advanceToNext();

  expect([first, second]).toStrictEqual([1000, 2000]);
});
