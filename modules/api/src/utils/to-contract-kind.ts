import type { MemorySubject } from '@heynixie/memory';

const contractKinds: Readonly<Record<MemorySubject, 'fact' | 'self'>> = {
  owner: 'fact',
  shared: 'fact',
  self: 'self',
};

export function toContractKind(subject: MemorySubject): 'fact' | 'self' {
  return contractKinds[subject];
}
