import type { MomentState } from './moment-context';

export function isIndexedMomentState(state: MomentState): boolean {
  return state === 'active' || state === 'retired';
}
