import type { RuntimeChangeState } from './types';

const transitions: Readonly<Record<RuntimeChangeState, readonly RuntimeChangeState[]>> = {
  in_force: ['adopted', 'superseded', 'retired'],
  adopted: [],
  superseded: [],
  retired: [],
};

export function canMoveRuntimeChange(from: RuntimeChangeState, to: RuntimeChangeState): boolean {
  return transitions[from].includes(to);
}
