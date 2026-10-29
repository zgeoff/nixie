import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { store } from './mocks/store';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useRoutedTasks } from './use-routed-tasks';

test('it gives the tasks the API lists', async () => {
  await createDeviceSession();

  const garden = await store.tasks.create({
    brief: 'Plans the vegetable beds.',
    lastActivityAt: new Date('2026-10-14T09:00:00.000Z'),
    name: 'Garden plan',
    state: 'waiting',
    taskID: 'k3vq8m2xpa',
  });

  const hook = renderHook(() => useRoutedTasks(new Map()));

  await waitFor(() => {
    expect(hook.result.current).toStrictEqual([
      {
        brief: garden.brief,
        lastActivityAt: garden.lastActivityAt,
        name: 'Garden plan',
        state: 'waiting',
        taskID: 'k3vq8m2xpa',
      },
    ]);
  });
});

test('it reads the list again when a route names a task the list does not hold', async () => {
  await createDeviceSession();

  await store.tasks.create({
    lastActivityAt: new Date('2026-10-14T08:00:00.000Z'),
    name: 'Garden plan',
    taskID: 'k3vq8m2xpa',
  });

  let routes = new Map([[4, { isMove: false, taskID: 'k3vq8m2xpa' }]]);

  const hook = renderHook(() => useRoutedTasks(routes));

  await waitFor(() => {
    expect(hook.result.current.map((task) => task.name)).toStrictEqual(['Garden plan']);
  });

  await store.tasks.create({
    lastActivityAt: new Date('2026-10-14T09:00:00.000Z'),
    name: 'Seed order',
    taskID: 'p7hd2wq9zn',
  });

  routes = new Map([...routes, [7, { isMove: false, taskID: 'p7hd2wq9zn' }]]);

  hook.rerender();

  await waitFor(() => {
    expect(hook.result.current.map((task) => task.name)).toStrictEqual([
      'Seed order',
      'Garden plan',
    ]);
  });
});
