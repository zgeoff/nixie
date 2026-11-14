import { expect, test } from 'bun:test';
import { toRecoveryResponse } from './to-recovery-response';

test('it names each task from the directory', () => {
  const started = {
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
    toCheck: [
      { taskID: 'k3x9m2p7qa', stateAtBackup: 'running', wasRunning: true, pendingActions: 2 },
      { taskID: 'm5t8w2n6rb', stateAtBackup: 'waiting', wasRunning: false, pendingActions: 0 },
    ],
  } as const;

  const response = toRecoveryResponse(started, [
    { taskID: 'k3x9m2p7qa', name: 'Garden plan' },
    { taskID: 'm5t8w2n6rb', name: 'Tide tables' },
  ]);

  expect(response.toCheck.map((task) => task.name)).toStrictEqual(['Garden plan', 'Tide tables']);
});

test('it falls back to the task ID when the directory has no entry', () => {
  const started = {
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
    toCheck: [
      { taskID: 'k3x9m2p7qa', stateAtBackup: 'running', wasRunning: true, pendingActions: 2 },
      { taskID: 'm5t8w2n6rb', stateAtBackup: 'waiting', wasRunning: false, pendingActions: 0 },
    ],
  } as const;

  const response = toRecoveryResponse(started, [{ taskID: 'k3x9m2p7qa', name: 'Garden plan' }]);

  expect(response.toCheck.map((task) => task.name)).toStrictEqual(['Garden plan', 'm5t8w2n6rb']);
});

test('it gives the two times as dates and keeps the state fields', () => {
  const started = {
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
    toCheck: [
      { taskID: 'k3x9m2p7qa', stateAtBackup: 'running', wasRunning: true, pendingActions: 2 },
      { taskID: 'm5t8w2n6rb', stateAtBackup: 'waiting', wasRunning: false, pendingActions: 0 },
    ],
  } as const;

  const response = toRecoveryResponse(started, []);

  expect(response).toStrictEqual({
    restoredAt: new Date(2000),
    backupTakenAt: new Date(1000),
    toCheck: [
      {
        taskID: 'k3x9m2p7qa',
        name: 'k3x9m2p7qa',
        stateAtBackup: 'running',
        wasRunning: true,
        pendingActions: 2,
      },
      {
        taskID: 'm5t8w2n6rb',
        name: 'm5t8w2n6rb',
        stateAtBackup: 'waiting',
        wasRunning: false,
        pendingActions: 0,
      },
    ],
  });
});
