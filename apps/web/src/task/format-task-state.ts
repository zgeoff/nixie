import type { ListedState } from './listed-state';

const stateLabels: Readonly<Record<ListedState, string>> = {
  ready: 'Ready',
  running: 'Running',
  waiting: 'Waiting',
  idle: 'Idle',
  finished: 'Finished',
  asleep: 'Asleep',
  paused: 'Paused',
  stopped: 'Stopped',
  failed: 'Failed',
  done: 'Done',
  closed: 'Closed',
};

export function formatTaskState(state: ListedState): string {
  return stateLabels[state];
}
