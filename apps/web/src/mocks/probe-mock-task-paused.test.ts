import { expect, test } from 'bun:test';
import { pauseStore } from './pause-store';
import { probeMockTaskPaused } from './probe-mock-task-paused';

test('it finds no task paused while nixie runs', () => {
  expect(probeMockTaskPaused('k3x9m2p7qa')).toBeFalse();
});

test('it finds a task paused while the pause holds', async () => {
  await pauseStore.pauses.create({ cause: 'owner' });

  expect(probeMockTaskPaused('k3x9m2p7qa')).toBeTrue();
});

test('it finds an exempt task not paused', async () => {
  await pauseStore.pauses.create({ cause: 'owner' });
  await pauseStore.pauseExemptions.create({ taskID: 'k3x9m2p7qa' });

  expect(probeMockTaskPaused('k3x9m2p7qa')).toBeFalse();
});
