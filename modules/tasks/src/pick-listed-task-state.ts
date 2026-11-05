import type { ListedTask } from './read-task-list';
import type { TaskState } from './types';

export type ListedTaskState = TaskState | 'idle' | 'finished';

// A started task stores waiting after every turn, done or not, so the stored state alone cannot tell
// a task that waits on a reply from one that sent its report or has nothing to do.
export function pickListedTaskState(
  task: Pick<ListedTask, 'state' | 'waitingOn' | 'lastSentKind'>,
): ListedTaskState {
  if (task.state !== 'waiting' || task.waitingOn !== undefined) {
    return task.state;
  }

  return task.lastSentKind === 'report' ? 'finished' : 'idle';
}
