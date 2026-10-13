import { createHash } from 'node:crypto';
import type { ChangeKind } from './consolidation-types';
import type { VersionRef } from './types';

export interface ChangeOperation {
  readonly kind: ChangeKind;
  readonly inputs: readonly VersionRef[];

  // the text the change writes, or null for a retirement
  readonly text: string | null;

  // random bytes sealed beside the text, so the hash says nothing about the text once a forget
  // makes the text unreadable
  readonly salt: string;
}

// The action hash of a consolidation change: SHA-256 over its exact operation in a fixed field
// order, so one changed word or one other version read makes a different hash.
export function buildConsolidationHash(operation: ChangeOperation): string {
  const canonical = JSON.stringify({
    kind: 'memory_consolidation',
    change: operation.kind,
    inputs: operation.inputs.map((input) => ({ itemID: input.itemID, version: input.version })),
    text: operation.text?.normalize('NFC') ?? null,
    salt: operation.salt,
  });

  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
