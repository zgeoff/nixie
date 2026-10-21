import type { SandboxSpec } from '@heynixie/sandbox';
import type { ImpPolicy } from './types';

export function buildImpPolicy(spec: SandboxSpec): ImpPolicy {
  if (spec.egress.kind === 'allow') {
    return { mode: 'box', allow: spec.egress.hosts };
  }

  return { mode: spec.egress.kind, allow: [] };
}
