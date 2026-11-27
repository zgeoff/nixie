import type { ListedState } from './listed-state';
import type { ListedTask } from './use-live-task-list';

export interface DashboardGroups {
  readonly conversation: ListedTask | undefined;
  readonly held: readonly ListedTask[];

  // the tasks that supervise a coding session; empty while the feature is off
  readonly supervised: readonly ListedTask[];
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

// A task that supervises a session, started or joined, groups apart in any listed state but closed
// while the coding feature is on, so a finished task keeps its session's last state until you
// close it. A task with no listed state groups by its stored state.
export function collectDashboardGroups(
  tasks: readonly ListedTask[],
  isCodingOn: boolean,
): DashboardGroups {
  const others = tasks.filter((task) => task.taskID !== 'conversation');
  const isSupervised = (task: ListedTask): boolean => isCodingOn && task.session !== undefined;
  const supervised = others.filter((task) => isSupervised(task));
  const unsupervised = others.filter((task) => !isSupervised(task));

  return {
    conversation: tasks.find((task) => task.taskID === 'conversation'),
    held: unsupervised.filter((task) => heldStates.has(task.listedState ?? task.state)),
    supervised: supervised.filter((task) => (task.listedState ?? task.state) !== 'closed'),
    working: unsupervised.filter((task) => workingStates.has(task.listedState ?? task.state)),
  };
}
