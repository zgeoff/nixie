import type { ContentSource, EnvelopeRecord } from '@heynixie/log';
import { z } from 'zod';
import type { LabelChange, LabelOrigin } from '../../types';

// A later release can add a field, so the record accepts a key it does not know.
const labelled = z.looseObject({
  itemID: z.string(),
  revision: z.int().min(1),
  version: z.int().min(1),
  change: z.enum(['written', 'edited', 'backfilled']),
  sealed: z.base64(),
  origin: z.enum(['owner', 'conversation', 'task', 'lapse', 'migration']),
  source: z.enum(['owner', 'owner_data', 'untrusted']),
  taskID: z.string().nullable(),
  proposalID: z.string().nullable(),
  model: z.string().nullable(),
});

const proposalLabelled = z.strictObject({
  proposalID: z.string(),
  itemID: z.string(),
  sealed: z.base64(),
  targetRevision: z.int().min(1).nullable(),
  isLabelOnly: z.boolean(),
});

export interface LabelledRecord {
  readonly kind: 'memory.labelled';
  readonly itemID: string;
  readonly revision: number;
  readonly version: number;
  readonly change: LabelChange;
  readonly sealed: string;
  readonly origin: LabelOrigin;
  readonly source: ContentSource;
  readonly taskID: string | null;
  readonly proposalID: string | null;
  readonly model: string | null;
}

export interface ProposalLabelledRecord {
  readonly kind: 'memory.proposal_labelled';
  readonly proposalID: string;
  readonly itemID: string;
  readonly sealed: string;
  readonly targetRevision: number | null;
  readonly isLabelOnly: boolean;
}

export type LabelRecord = LabelledRecord | ProposalLabelledRecord;

export function parseLabelRecord(record: EnvelopeRecord): LabelRecord | null {
  if (record.kind === 'memory.labelled') {
    const parsed = labelled.parse(record.payload);

    return {
      kind: record.kind,
      itemID: parsed.itemID,
      revision: parsed.revision,
      version: parsed.version,
      change: parsed.change,
      sealed: parsed.sealed,
      origin: parsed.origin,
      source: parsed.source,
      taskID: parsed.taskID,
      proposalID: parsed.proposalID,
      model: parsed.model,
    };
  }

  if (record.kind === 'memory.proposal_labelled') {
    return { kind: record.kind, ...proposalLabelled.parse(record.payload) };
  }

  return null;
}
