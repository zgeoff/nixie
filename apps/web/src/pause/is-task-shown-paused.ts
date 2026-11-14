import type { ListedTask } from '../task/use-live-task-list';

const pausableStates = new Set<ListedTask['state']>(['ready', 'running', 'waiting', 'paused']);

// A task that has finished shows its own state: nixie's pause holds nothing of it.
export function isTaskShownPaused(task: ListedTask): boolean {
  return task.isPausedByNixie && pausableStates.has(task.state);
}
