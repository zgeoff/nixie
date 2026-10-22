import type { RecordKind } from '@heynixie/log';
import type { ProposalOutcome } from './types';

export function buildProposalOutcomes(
  kinds: Readonly<Record<ProposalOutcome, RecordKind>>,
): ReadonlyMap<RecordKind, ProposalOutcome> {
  return new Map([
    [kinds.approved, 'approved'],
    [kinds.rejected, 'rejected'],
    [kinds.lapsed, 'lapsed'],
  ]);
}
