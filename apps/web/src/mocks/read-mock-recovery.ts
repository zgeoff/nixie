import { pauseStore } from './pause-store';

export function readMockRecovery() {
  const recovery = pauseStore.recoveries.all().findLast(() => true);

  if (recovery === undefined) {
    return null;
  }

  return {
    backupTakenAt: recovery.backupTakenAt,
    restoredAt: recovery.restoredAt,
    toCheck: recovery.toCheck.map((task) => structuredClone(task)),
  };
}
