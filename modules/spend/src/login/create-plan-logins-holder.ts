import type { PlanLogins, PlanLoginsHolder } from '../types';

// Holds `unreachable` until the first read, so a step that starts before any read fails closed.
export function createPlanLoginsHolder(): PlanLoginsHolder {
  const held: { current: PlanLogins } = { current: { state: 'unreachable' } };

  return {
    read: () => held.current,
    write: (logins) => {
      held.current = logins;
    },
  };
}
