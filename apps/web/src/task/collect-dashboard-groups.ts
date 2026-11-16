import type { ListedState } from './listed-state';
import type { ListedTask } from './use-live-task-list';

export interface DashboardGroups {
  readonly conversation: ListedTask | undefined;
  readonly held: readonly ListedTask[];
  readonly working: readonly ListedTask[];
}

const workingStates: ReadonlySet<ListedState> = new Set([
  'ready',
  'running',
  'waiting',
  'idle',
  'asleep',
  'finished',
]);

const heldStates: ReadonlySet<ListedState> = new Set(['paused', 'stopped', 'failed']);

// A task from a server that gives no listed state groups by its stored state.
export function collectDashboardGroups(tasks: readonly ListedTask[]): DashboardGroups {
  const others = tasks.filter((task) => task.taskID !== 'conversation');

  return {
    conversation: tasks.find((task) => task.taskID === 'conversation'),
    held: others.filter((task) => heldStates.has(task.listedState ?? task.state)),
    working: others.filter((task) => workingStates.has(task.listedState ?? task.state)),
  };
}
