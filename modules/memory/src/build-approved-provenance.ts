import { z } from 'zod';
import type { MemoryProposalRow } from './gate-types';
import type { Provenance } from './types';

const checksColumn = z.record(z.string(), z.json());

// An approved proposal keeps its origin, source and model, so outside content stays labelled as
// such. Your edited text takes you as its origin and its source.
export function buildApprovedProvenance(row: MemoryProposalRow, isEdited: boolean): Provenance {
  const base = {
    taskID: row.task_id,
    proposalID: row.proposal_id,
    checks: row.checks === null ? null : checksColumn.parse(JSON.parse(row.checks)),
    ...(row.thread === null ? {} : { thread: row.thread }),
  };

  return isEdited
    ? { ...base, origin: 'owner', source: 'owner', model: null }
    : { ...base, origin: row.origin, source: row.source, model: row.model };
}
