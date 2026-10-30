import type { TaskState } from '@heynixie/task-control';
import type { ListedTask } from './use-live-task-list';

export interface DashboardGroups {
  readonly conversation: ListedTask | undefined;
  readonly held: readonly ListedTask[];
  readonly working: readonly ListedTask[];
}

const workingStates: ReadonlySet<TaskState> = new Set(['ready', 'running', 'waiting']);
const heldStates: ReadonlySet<TaskState> = new Set(['paused', 'stopped', 'failed']);

export function collectDashboardGroups(tasks: readonly ListedTask[]): DashboardGroups {
  const others = tasks.filter((task) => task.taskID !== 'conversation');

  return {
    conversation: tasks.find((task) => task.taskID === 'conversation'),
    held: others.filter((task) => heldStates.has(task.state)),
    working: others.filter((task) => workingStates.has(task.state)),
  };
}
