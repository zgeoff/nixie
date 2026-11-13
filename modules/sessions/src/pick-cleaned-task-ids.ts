import type { TaskSetup } from '@heynixie/tasks';

export interface CleanupCandidate {
  readonly taskID: string;
  readonly setup: TaskSetup | null;
}

// A task is picked for 1 of 2 reasons: it reads memory, so it can hold a forgotten item in its
// session, or its thread holds the forgotten record, so its session holds that record's text.
export function pickCleanedTaskIDs(
  candidates: readonly CleanupCandidate[],
  recordThread: string | null,
): readonly string[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.setup?.options?.memory === 'read' || candidate.taskID === recordThread,
    )
    .map((candidate) => candidate.taskID);
}

// A purge acquires the task's imp, which would create a sandbox for a task that has none.
export function isGuestPurged(sandboxCount: number): boolean {
  return sandboxCount > 0;
}
