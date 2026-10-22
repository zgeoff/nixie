import { createHash } from 'node:crypto';
import type { MemorySubject, ProposalOperationKind } from './types';

export interface ProposalOperation {
  readonly operation: ProposalOperationKind;
  readonly itemID: string;
  readonly targetVersion: number | null;
  readonly isPinned: boolean;
  readonly text: string;
  readonly quote: string | null;

  // The salt keeps the hash from revealing the text once a forget makes the text unreadable.
  readonly salt: string;

  // Stored hashes name the subject under the key itemKind, and only for a self-note or a shared
  // item, so a change to either rule changes the hash of every pending proposal.
  readonly subject?: MemorySubject;
}

export function buildProposalHash(operation: ProposalOperation): string {
  const canonical = JSON.stringify({
    kind: 'memory_write',
    operation: operation.operation,
    itemID: operation.itemID,
    targetVersion: operation.targetVersion,
    isPinned: operation.isPinned,
    text: operation.text.normalize('NFC'),
    quote: operation.quote?.normalize('NFC') ?? null,
    salt: operation.salt,
    ...(operation.subject === undefined || operation.subject === 'owner'
      ? {}
      : { itemKind: operation.subject }),
  });

  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
