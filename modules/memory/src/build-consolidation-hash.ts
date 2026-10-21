import { createHash } from 'node:crypto';
import type { ChangeKind } from './consolidation-types';
import type { VersionRef } from './types';

export interface ChangeOperation {
  readonly kind: ChangeKind;
  readonly inputs: readonly VersionRef[];

  readonly text: string | null;

  // The salt keeps the hash from revealing the text once a forget makes the text unreadable.
  readonly salt: string;
}

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
