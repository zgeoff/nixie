import type { ListedTask } from './use-live-task-list';

export function formatTaskName(tasks: readonly ListedTask[], taskID: string): string {
  return tasks.find((task) => task.taskID === taskID)?.name ?? `task ${taskID}`;
}
