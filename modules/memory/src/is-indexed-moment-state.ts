import type { MomentState } from './moment-types';

export function isIndexedMomentState(state: MomentState): boolean {
  return state === 'active' || state === 'retired';
}
