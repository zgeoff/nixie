import type { MemorySubject } from '@heynixie/memory';

// The kind a client of the release before reads in place of the subject: self for a self-note, and
// fact for every other item or proposal.
export function toContractKind(subject: MemorySubject): 'fact' | 'self' {
  return subject === 'self' ? 'self' : 'fact';
}
