import type { RecoveryStarted } from '@heynixie/tasks';

interface TaskName {
  readonly taskID: string;
  readonly name: string;
}

export function toRecoveryResponse(started: RecoveryStarted, directory: readonly TaskName[]) {
  const names = new Map(directory.map((profile) => [profile.taskID, profile.name]));

  return {
    restoredAt: new Date(started.restoredAt),
    backupTakenAt: new Date(started.backupTakenAt),
    toCheck: started.toCheck.map((task) => ({
      ...task,
      name: names.get(task.taskID) ?? task.taskID,
    })),
  };
}
