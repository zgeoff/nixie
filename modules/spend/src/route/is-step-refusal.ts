import type { SandboxCount } from '../types';

// Whether the gateway's last refusal of a sandbox is a refusal of a step that began at the instant
// and ran on the route: one at the route's day or month limit, never at the sandbox's own limit.
export function isStepRefusal(count: SandboxCount, route: string, startedAtMs: number): boolean {
  const refusal = count.lastRefusal;

  return (
    refusal !== null &&
    refusal.route === route &&
    refusal.counter !== 'sandbox' &&
    refusal.atMs >= startedAtMs
  );
}
