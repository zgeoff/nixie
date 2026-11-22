import { conversationTaskID } from '@heynixie/tasks';
import type { TaskSetup } from '@heynixie/tasks';

export interface CleanupCandidate {
  readonly taskID: string;
  readonly setup: TaskSetup | null;
}

// A note's text reaches a task only through a notebook tool in the task's own tool list, so a
// forgotten note picks the started tasks that list one, and each definition's task.
function hasNotebookTool(candidate: CleanupCandidate): boolean {
  return (
    candidate.setup?.kind === 'started' &&
    (candidate.setup.options?.tools.some((tool) => tool.startsWith('notebook.')) ?? false)
  );
}

// A task is picked when it reads memory, is a definition's task, whose version may read memory in a
// later task run, holds the forgotten record on its thread, or holds the log grant while the record
// sits on the conversation's thread. Each way leaves the record's text in its session.
export function pickCleanedTaskIDs(
  candidates: readonly CleanupCandidate[],
  recordThread: string | null,
  isNote = false,
): readonly string[] {
  if (isNote) {
    return candidates
      .filter((candidate) => candidate.setup?.kind === 'definition' || hasNotebookTool(candidate))
      .map((candidate) => candidate.taskID);
  }

  return candidates
    .filter(
      (candidate) =>
        (candidate.setup?.kind === 'started' && candidate.setup.options?.memory === 'read') ||
        candidate.setup?.kind === 'definition' ||
        (candidate.setup?.kind === 'started' &&
          candidate.setup.options?.log === 'conversation' &&
          recordThread === conversationTaskID) ||
        candidate.taskID === recordThread,
    )
    .map((candidate) => candidate.taskID);
}

// A purge acquires the task's imp, which would create a sandbox for a task that has none.
export function isGuestPurged(sandboxCount: number): boolean {
  return sandboxCount > 0;
}
