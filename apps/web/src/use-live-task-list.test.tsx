import { expect, mock, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { buildStubTimer } from './test-utils/build-stub-timer';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useLiveTaskList } from './use-live-task-list';

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
    expect(ctx.follows).toHaveBeenCalledWith({ json: { afterSequence: read.sequence } });
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
