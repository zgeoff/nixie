import type { TaskWaitState } from './types';

const transitions: Readonly<Record<TaskWaitState, readonly TaskWaitState[]>> = {
  none: [],
  open: ['answered', 'released'],
  answered: [],
  released: [],
};

const states: readonly TaskWaitState[] = ['none', 'open', 'answered', 'released'];

export function collectTaskWaitSources(to: TaskWaitState): readonly TaskWaitState[] {
  return states.filter((state) => transitions[state].includes(to));
}
