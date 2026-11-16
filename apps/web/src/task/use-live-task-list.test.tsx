import { expect, mock, onTestFinished, test } from 'bun:test';
import { timeoutManager } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/server';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import { taskListRefetchMs, useLiveTaskList } from './use-live-task-list';

function setupTest() {
  const follows = mock<(body: unknown) => void>();

  server.use(
    http.post('*/rpc/records/follow', async (info) => {
      const body: unknown = await info.request.clone().json();

      follows(body);
    }),
  );

  return { follows, timer: buildStubTimer() };
}

test('it follows every thread from the sequence the list read at', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });

  const read = await store.records.create({ kind: 'task.created', thread: 'k3vq8m2xpa' });

  const hook = renderHook(() => useLiveTaskList({ startTimer: ctx.timer.startTimer }));

  await waitFor(() => {
    expect(ctx.follows).toHaveBeenCalledWith({
      json: { afterSequence: read.sequence, clipPayloads: true },
    });
  });

  expect(hook.result.current.status).toBe('loaded');
});

test('it reads the list again for a task record and leaves it for any other', async () => {
  const ctx = setupTest();
  const lists = mock<() => void>();

  server.use(
    http.post('*/rpc/tasks/list', () => {
      lists();
    }),
  );

  await createDeviceSession();

  const garden = await store.tasks.create({ name: 'Garden plan', state: 'running' });

  const hook = renderHook(() => useLiveTaskList({ startTimer: ctx.timer.startTimer }));

  await waitFor(() => {
    expect(ctx.follows).toHaveBeenCalledOnce();
  });

  await store.records.create({ kind: 'owner_message', message: { text: 'Hello.' } });

  await store.tasks.update(garden, {
    data(draft) {
      draft.state = 'paused';
    },
  });

  await store.records.create({ kind: 'task.paused', thread: garden.taskID });

  await waitFor(() => {
    expect(hook.result.current.tasks.map((task) => task.state)).toStrictEqual(['paused']);
  });

  expect(lists).toHaveBeenCalledTimes(2);
});

test('it reports a list that failed to load, and loads it again on a retry', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan' });

  server.use(http.post('*/rpc/tasks/list', () => HttpResponse.error(), { once: true }));

  const hook = renderHook(() => useLiveTaskList({ startTimer: ctx.timer.startTimer }));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('failed');
  });

  act(() => {
    hook.result.current.onRetry();
  });

  await waitFor(() => {
    expect(hook.result.current.tasks.map((task) => task.name)).toStrictEqual(['Garden plan']);
  });
});

test('it reads the list again each minute, and with a filter puts it in the read', async () => {
  const ctx = setupTest();

  const intervals = new Map<number, () => void>();

  const bodies = mock<(body: unknown) => void>();

  const systemProvider = {
    setTimeout: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
    clearTimeout: (id: ReturnType<typeof setTimeout> | undefined) => {
      clearTimeout(id);
    },
    setInterval: (callback: () => void, delayMs: number) => setInterval(callback, delayMs),
    clearInterval: (id: ReturnType<typeof setInterval> | undefined) => {
      clearInterval(id);
    },
  };

  timeoutManager.setTimeoutProvider({
    ...systemProvider,
    setInterval: (callback, delayMs) => {
      intervals.set(delayMs, callback);

      return systemProvider.setInterval(() => {}, delayMs);
    },
  });

  onTestFinished(() => {
    timeoutManager.setTimeoutProvider(systemProvider);
  });

  server.use(
    http.post('*/rpc/tasks/list', async (info) => {
      const body: unknown = await info.request.clone().json();

      bodies(body);
    }),
  );

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan' });

  const hook = renderHook(() =>
    useLiveTaskList({
      definitionID: 'water-the-tomatoes',
      startTimer: ctx.timer.startTimer,
      state: 'asleep',
    }),
  );

  await waitFor(() => {
    expect(hook.result.current.status).toBe('loaded');
  });

  act(() => {
    intervals.get(taskListRefetchMs)?.();
  });

  await waitFor(() => {
    expect(bodies).toHaveBeenCalledTimes(2);
  });

  expect(bodies).toHaveBeenLastCalledWith({
    json: { definitionID: 'water-the-tomatoes', states: ['asleep'] },
  });
});
