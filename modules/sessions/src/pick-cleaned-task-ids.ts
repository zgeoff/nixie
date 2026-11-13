import type { TaskSetup } from '@heynixie/tasks';

export interface CleanupCandidate {
  readonly taskID: string;
  readonly setup: TaskSetup | null;
}

// Only a task that reads memory can hold a forgotten item in its session.
export function pickCleanedTaskIDs(candidates: readonly CleanupCandidate[]): readonly string[] {
  return candidates
    .filter((candidate) => candidate.setup?.options?.memory === 'read')
    .map((candidate) => candidate.taskID);
}

// A purge acquires the task's imp, which would create a sandbox for a task that has none.
export function isGuestPurged(sandboxCount: number): boolean {
  return sandboxCount > 0;
}
