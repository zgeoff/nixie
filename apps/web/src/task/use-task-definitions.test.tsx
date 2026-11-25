import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { useLiveConnection } from '../live/use-live-connection';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import { useLiveTaskList } from './use-live-task-list';
import { useTaskDefinitions } from './use-task-definitions';

function setupTest() {
  return { timer: buildStubTimer() };
}

test('it offers the definition of a task created while the dashboard is open', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ definitionID: 'water-the-tomatoes', name: 'Water the tomatoes' });

  const hook = renderHook(() => {
    useLiveConnection();

    return {
      definitions: useTaskDefinitions(),
      listed: useLiveTaskList({ startTimer: ctx.timer.startTimer }),
    };
  });

  await waitFor(() => {
    expect(hook.result.current.definitions).toStrictEqual([
      { definitionID: 'water-the-tomatoes', name: 'Water the tomatoes' },
    ]);
  });

  const feed = await store.tasks.create({ definitionID: 'feed-the-cat', name: 'Feed the cat' });

  await store.records.create({ kind: 'task.created', thread: feed.taskID });

  await waitFor(() => {
    expect(hook.result.current.definitions).toIncludeSameMembers([
      { definitionID: 'water-the-tomatoes', name: 'Water the tomatoes' },
      { definitionID: 'feed-the-cat', name: 'Feed the cat' },
    ]);
  });
});
