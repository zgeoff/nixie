import { z } from 'zod';
import { findImageSource } from './find-image-source';
import type { MemoryProposalRow } from './gate-types';
import type { Provenance } from './types';

const checksColumn = z.record(z.string(), z.json());

export function buildApprovedProvenance(row: MemoryProposalRow, isEdited: boolean): Provenance {
  const checks = row.checks === null ? null : checksColumn.parse(JSON.parse(row.checks));

  const base = {
    taskID: row.task_id,
    proposalID: row.proposal_id,
    checks,
    ...(row.thread === null ? {} : { thread: row.thread }),
  };

  if (!isEdited) {
    return { ...base, origin: row.origin, source: row.source, model: row.model };
  }

  return {
    ...base,
    origin: 'owner',
    source: findImageSource(checks) === null ? 'owner' : row.source,
    model: null,
  };
}
