import type { Sandbox, Suspension } from '@heynixie/sandbox';

interface SandboxState {
  readonly current: Sandbox | null;
  readonly mayBeAsleep: boolean;
}

export type SandboxPlan =
  | { readonly kind: 'create' }
  | {
      readonly kind: 'use';
      readonly sandbox: Sandbox;
      readonly toWake: Extract<Suspension, { readonly kind: 'memory' }> | null;
    };

export function pickSandboxPlan(state: SandboxState): SandboxPlan {
  if (state.current === null) {
    return { kind: 'create' };
  }

  const suspension = state.current.suspension;

  // Waking an awake sandbox costs nothing, so a sandbox that may sleep is woken without a check.
  const toWake = state.mayBeAsleep && suspension.kind === 'memory' ? suspension : null;

  return { kind: 'use', sandbox: state.current, toWake };
}
