import { sandboxKinds } from './sandbox-kinds';
import type { GrantSpec, SandboxKind, SandboxLimits, SandboxSpec } from './types';

export interface SandboxSpecInput {
  readonly kind: SandboxKind;
  readonly image: string;
  readonly owner: string;
  readonly limits: SandboxLimits;

  readonly modelGrant?: GrantSpec;

  readonly allowHosts?: readonly string[];
  readonly extraGrants?: readonly GrantSpec[];
}

export function buildSandboxSpec(input: SandboxSpecInput): SandboxSpec {
  const rule = sandboxKinds[input.kind];
  const grants = rule.hasModelGrant && input.modelGrant ? [input.modelGrant] : [];

  return {
    kind: input.kind,
    image: input.image,
    owner: input.owner,
    egress: buildEgress(rule.egress, input.allowHosts ?? []),
    grants: input.kind === 'coding' ? [...grants, ...(input.extraGrants ?? [])] : grants,
    toolRoute: rule.toolRoute,
    limits: input.limits,
  };
}

function buildEgress(
  kind: 'none' | 'public' | 'allow',
  hosts: readonly string[],
): SandboxSpec['egress'] {
  if (kind === 'allow') {
    return { kind, hosts };
  }

  return { kind };
}
