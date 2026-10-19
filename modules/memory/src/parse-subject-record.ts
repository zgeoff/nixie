import type { EnvelopeRecord } from '@heynixie/log';
import { z } from 'zod';
import type { MemorySubject } from './types';

const itemMark = z.strictObject({ itemID: z.string() });
const proposalMark = z.strictObject({ proposalID: z.string() });

// A mark of a new item or its proposal with a subject other than owner. The release before reads a
// version or proposal record as a strict shape and skips a kind it does not know, so the mark is a
// record of its own, and the self-note marks keep the names that release reads.
export type SubjectRecord =
  | { readonly target: 'item'; readonly itemID: string; readonly subject: MarkedSubject }
  | { readonly target: 'proposal'; readonly proposalID: string; readonly subject: MarkedSubject };

type MarkedSubject = Exclude<MemorySubject, 'owner'>;

// Reads a subject record's payload into its typed shape, or null for a record of another kind. A
// subject record whose payload breaks its shape throws, so a fold never writes a half-read row.
export function parseSubjectRecord(record: EnvelopeRecord): SubjectRecord | null {
  const itemSubject = itemMarks.get(record.kind);

  if (itemSubject !== undefined) {
    return { target: 'item', ...itemMark.parse(record.payload), subject: itemSubject };
  }

  const proposalSubject = proposalMarks.get(record.kind);

  if (proposalSubject !== undefined) {
    return { target: 'proposal', ...proposalMark.parse(record.payload), subject: proposalSubject };
  }

  return null;
}

const itemMarks = new Map<string, MarkedSubject>([
  ['memory.self_noted', 'self'],
  ['memory.shared_noted', 'shared'],
]);

const proposalMarks = new Map<string, MarkedSubject>([
  ['memory.proposal_self_noted', 'self'],
  ['memory.proposal_shared_noted', 'shared'],
]);
