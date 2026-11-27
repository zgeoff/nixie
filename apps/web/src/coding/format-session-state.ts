import type { ListedTask } from '../task/use-live-task-list';

export type ListedSession = NonNullable<ListedTask['session']>;

const stateLabels: Readonly<Record<ListedSession['state'], string>> = {
  running: 'Running',
  waiting: 'Waiting for you',
  idle: 'Idle',
  ended: 'Ended',
  gone: 'Out of reach',
};

export function formatSessionState(state: ListedSession['state']): string {
  return stateLabels[state];
}
