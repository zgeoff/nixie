import { SandboxSpecRefusedError } from './sandbox-spec-refused-error';
import type { SandboxSpec } from './types';

export function requireSandboxSpec(spec: SandboxSpec): void {
  requireExitRule(spec);

  if (spec.egress.kind === 'allow' && spec.egress.hosts.length === 0) {
    throw new SandboxSpecRefusedError('allowed egress with no hosts');
  }

  if (spec.owner.length === 0) {
    throw new SandboxSpecRefusedError('no owner');
  }

  const limits = [spec.limits.vcpus, spec.limits.memoryMiB, spec.limits.diskMiB];

  if (!limits.every((value) => Number.isInteger(value) && value > 0)) {
    throw new SandboxSpecRefusedError('limits must be positive whole numbers');
  }
}

// A grant is an exit for whatever the sandbox holds, so a sandbox with public egress never holds
// one.
function requireExitRule(spec: SandboxSpec): void {
  if (spec.grants.length === 0 || spec.egress.kind === 'none') {
    return;
  }

  if (spec.egress.kind === 'public') {
    throw new SandboxSpecRefusedError('public egress with a grant');
  }

  if (spec.kind !== 'coding') {
    throw new SandboxSpecRefusedError(
      `a grant with egress outside a coding session (${spec.kind})`,
    );
  }
}
