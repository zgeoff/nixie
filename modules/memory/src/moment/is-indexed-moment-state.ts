import type { MomentState } from '../utils/moment-context';

export function isIndexedMomentState(state: MomentState): boolean {
  return state === 'active' || state === 'retired';
}
