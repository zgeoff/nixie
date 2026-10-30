import { expect, test } from 'bun:test';
import { buildBrowserClient } from './build-browser-client';
import { store } from './mocks/store';
import { runTaskControl } from './run-task-control';
import { createDeviceSession } from './test-utils/create-device-session';

test.each([
  ['pause', 'waiting', 'paused'],
  ['resume', 'paused', 'ready'],
  ['stop', 'running', 'stopped'],
  ['restart', 'stopped', 'ready'],
  ['close', 'waiting', 'closed'],
  ['interrupt', 'running', 'running'],
] as const)('it sends a %s of a %s task, which leaves it %s', async (control, state, expected) => {
  await createDeviceSession();

  await store.tasks.create({ resumeState: null, state, taskID: 'k3vq8m2xpa' });

  const controlled = await runTaskControl(buildBrowserClient(), {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    control,
    taskID: 'k3vq8m2xpa',
  });

  expect(controlled.state).toBe(expected);
});
