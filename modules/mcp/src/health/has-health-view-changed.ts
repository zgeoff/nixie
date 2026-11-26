import type { ServerHealth } from './types';

// Whether the servers page would show another health: it shows the error and the next try of an
// unhealthy server only.
export function hasHealthViewChanged(previous: ServerHealth, next: ServerHealth): boolean {
  if (previous.isUnhealthy !== next.isUnhealthy) {
    return true;
  }

  return (
    next.isUnhealthy &&
    (previous.lastError !== next.lastError || previous.nextTryAtMs !== next.nextTryAtMs)
  );
}
