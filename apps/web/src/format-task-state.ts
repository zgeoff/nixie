import type { TaskState } from '@heynixie/task-control';

const stateLabels: Readonly<Record<TaskState, string>> = {
  ready: 'Ready',
  running: 'Running',
  waiting: 'Waiting',
  paused: 'Paused',
  stopped: 'Stopped',
  failed: 'Failed',
  done: 'Done',
  closed: 'Closed',
};

export function formatTaskState(state: TaskState): string {
  return stateLabels[state];
}
