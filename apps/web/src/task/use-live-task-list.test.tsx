import { expect, mock, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/server';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import { useLiveTaskList } from './use-live-task-list';

function setupTest() {
  return { timer: buildStubTimer() };
}

test('it lists the tasks the API reads', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan' });

  const hook = renderHook(() => useLiveTaskList({ startTimer: ctx.timer.startTimer }));

  await waitFor(() => {
    expect(hook.result.current.tasks.map((task) => task.name)).toStrictEqual(['Garden plan']);
  });

  expect(hook.result.current.status).toBe('loaded');
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

test('it puts the filter in the read', async () => {
  const ctx = setupTest();
  const bodies = mock<(body: unknown) => void>();

  server.use(
    http.post('*/rpc/tasks/list', async (info) => {
      const body: unknown = await info.request.clone().json();

      bodies(body);
    }),
  );

  await createDeviceSession();

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

  expect(bodies).toHaveBeenCalledWith({
    json: { definitionID: 'water-the-tomatoes', states: ['asleep'] },
  });
});

test('it reads the list again at the time the list says it changes on its own', async () => {
  const ctx = setupTest();
  const lists = mock<() => void>();

  server.use(
    http.post('*/rpc/tasks/list', () => {
      lists();
    }),
  );

  await createDeviceSession();

  await store.tasks.create({
    name: 'Water the tomatoes',
    nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

  const hook = renderHook(() => useLiveTaskList({ startTimer: ctx.timer.startTimer }));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('loaded');
  });

  const delayMs = await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(lists).toHaveBeenCalledTimes(2);
  });

  expect(delayMs).toBeWithin(3_590_000, 3_600_001);
});

test('it starts no timer for a list with no time of its own change', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan' });

  const hook = renderHook(() => useLiveTaskList({ startTimer: ctx.timer.startTimer }));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('loaded');
  });

  expect(ctx.timer.countPending()).toBe(0);
});

test('it shows live updates as available while no stream failed', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const hook = renderHook(() => useLiveTaskList({ startTimer: ctx.timer.startTimer }));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('loaded');
  });

  expect(hook.result.current.unavailable).toBe(false);
});
