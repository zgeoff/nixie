import { createHash } from 'node:crypto';
import type { MemoryKind } from './types';

export interface ProposalOperation {
  readonly operation: 'remember' | 'retire';
  readonly itemID: string;
  readonly targetVersion: number | null;
  readonly isPinned: boolean;
  readonly text: string;
  readonly quote: string | null;

  // random bytes sealed beside the text, so the hash says nothing about the text once a forget
  // makes the text unreadable
  readonly salt: string;

  // the kind of the item, which only a self-note's hash names, so a fact's hash stays as it was
  // before kinds
  readonly itemKind?: MemoryKind;
}

// The action hash of a memory proposal: SHA-256 over its exact operation in a fixed field order,
// so one changed word makes a different hash.
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
    ...(operation.itemKind === 'self' ? { itemKind: 'self' } : {}),
  });

  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
