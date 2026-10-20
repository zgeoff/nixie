import type { MemorySubject } from '@heynixie/memory';

const contractKinds: Readonly<Record<MemorySubject, 'fact' | 'self'>> = {
  owner: 'fact',
  shared: 'fact',
  self: 'self',
};

// The kind a client of the release before reads in place of the subject, which the table maps for
// every subject, so a new subject fails the type check until it has a kind.
export function toContractKind(subject: MemorySubject): 'fact' | 'self' {
  return contractKinds[subject];
}
