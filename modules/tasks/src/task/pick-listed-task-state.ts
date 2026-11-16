import type { TaskState } from '../types';
import type { ListedTask } from './read-task-list';

export type ListedTaskState = TaskState | 'idle' | 'finished' | 'asleep';

// A started task stores waiting after every turn, done or not, so the stored state alone cannot tell
// a task that waits on a reply from one that no message wakes, one that reported and one that has
// nothing to do.
export function pickListedTaskState(
  task: Pick<ListedTask, 'state' | 'waitingOn' | 'wakeable' | 'newestRunEnd'>,
): ListedTaskState {
  if (task.state !== 'waiting' || task.waitingOn !== undefined) {
    return task.state;
  }

  if (!task.wakeable) {
    return 'asleep';
  }

  return task.newestRunEnd === 'reported' ? 'finished' : 'idle';
}
