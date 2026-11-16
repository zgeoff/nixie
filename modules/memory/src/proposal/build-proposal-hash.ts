import { createHash } from 'node:crypto';
import type { Labels, MemorySubject, ProposalOperationKind } from '../types';

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

  readonly newSubject?: MemorySubject;

  readonly until?: number | null;

  // Stored hashes name the labels, the revision and the label-only flag only for a proposal that
  // has a proposal label record, so a proposal with none hashes as it always did.
  readonly labels?: Labels;

  readonly targetRevision?: number | null;

  readonly isLabelOnly?: boolean;
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
    ...(operation.newSubject === undefined ? {} : { newSubject: operation.newSubject }),
    ...(operation.until === undefined || operation.until === null
      ? {}
      : { until: operation.until }),
    ...(operation.labels === undefined
      ? {}
      : {
          labels: {
            gist: operation.labels.gist.normalize('NFC'),
            topic: operation.labels.topic.normalize('NFC'),
            triggers: operation.labels.triggers.map((trigger) => trigger.normalize('NFC')),
          },
          targetRevision: operation.targetRevision ?? null,
          isLabelOnly: operation.isLabelOnly === true,
        }),
  });

  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
