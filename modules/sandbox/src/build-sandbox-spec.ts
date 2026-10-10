import { sandboxKinds } from './sandbox-kinds';
import type { GrantSpec, SandboxKind, SandboxLimits, SandboxSpec } from './types';

export interface SandboxSpecInput {
  readonly kind: SandboxKind;
  readonly image: string;
  readonly owner: string;
  readonly limits: SandboxLimits;

  // the profile's model credential, for a kind that runs a model loop
  readonly modelGrant?: GrantSpec;

  // a coding session's allowed hosts, and the grants its rules add
  readonly allowHosts?: readonly string[];
  readonly extraGrants?: readonly GrantSpec[];
}

// Builds the spec for one kind of work from the kinds table, so a caller names the work and never
// picks egress, grants or the tool route by hand.
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
