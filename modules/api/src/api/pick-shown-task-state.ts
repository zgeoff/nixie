import type { ListedTaskState, TaskState } from '@heynixie/tasks';

const pausableStates = new Set<TaskState>(['ready', 'running', 'waiting', 'paused']);

// While nixie is paused, a task that the pause holds lists as paused. A task that has finished,
// failed or closed keeps its own state, because the pause holds nothing of it. The stored state
// never changes.
export function pickShownTaskState(
  storedState: TaskState,
  listedState: ListedTaskState,
  isPausedByNixie: boolean,
): ListedTaskState {
  return isPausedByNixie && pausableStates.has(storedState) ? 'paused' : listedState;
}
