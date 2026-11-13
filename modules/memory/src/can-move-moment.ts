import type { MomentState } from './moment-context';

const transitions: Readonly<Record<MomentState, readonly MomentState[]>> = {
  active: ['retired', 'destroying'],
  retired: ['active', 'destroying'],
  destroying: ['destroyed'],
  destroyed: [],
};

export function canMoveMoment(from: MomentState, to: MomentState): boolean {
  return transitions[from].includes(to);
}
