import { expect, test } from 'bun:test';
import { pauseStore } from './pause-store';
import { readMockRecovery } from './read-mock-recovery';

test('it reads no recovery when the store holds none', () => {
  expect(readMockRecovery()).toBeNull();
});

test('it reads the newest recovery the store holds', async () => {
  await pauseStore.recoveries.create({
    restoredAt: new Date('2026-11-02T08:00:00Z'),
    backupTakenAt: new Date('2026-11-02T06:00:00Z'),
    toCheck: [],
  });

  await pauseStore.recoveries.create({
    restoredAt: new Date('2026-11-03T08:00:00Z'),
    backupTakenAt: new Date('2026-11-03T06:00:00Z'),
    toCheck: [
      {
        taskID: 'k3x9m2p7qa',
        name: 'Garden plan',
        stateAtBackup: 'running',
        wasRunning: true,
        pendingActions: 2,
      },
    ],
  });

  expect(readMockRecovery()).toStrictEqual({
    restoredAt: new Date('2026-11-03T08:00:00Z'),
    backupTakenAt: new Date('2026-11-03T06:00:00Z'),
    toCheck: [
      {
        taskID: 'k3x9m2p7qa',
        name: 'Garden plan',
        stateAtBackup: 'running',
        wasRunning: true,
        pendingActions: 2,
      },
    ],
  });
});
