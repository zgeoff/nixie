import type { SandboxSpec } from '@heynixie/sandbox';
import type { ImpPolicy } from './types';

// Maps a spec's egress onto imp's policies. A grant never changes the policy: the broker dials the
// granted host from the host container.
export function buildImpPolicy(spec: SandboxSpec): ImpPolicy {
  if (spec.egress.kind === 'allow') {
    return { mode: 'box', allow: spec.egress.hosts };
  }
  return { mode: spec.egress.kind, allow: [] };
}
