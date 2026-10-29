import type { EnvelopeRecord } from '@heynixie/log';
import { z } from 'zod';
import type { MemorySubject } from './types';

const itemMark = z.strictObject({ itemID: z.string() });
const proposalMark = z.strictObject({ proposalID: z.string() });
const subjectSchema = z.enum(['owner', 'self', 'shared']);
const itemChange = itemMark.extend({ subject: subjectSchema });
const proposalChange = proposalMark.extend({ subject: subjectSchema });

type MarkedSubject = Exclude<MemorySubject, 'owner'>;

// The release before reads a version or proposal record as a strict shape and skips a record kind
// it does not know, so a subject mark is a record of its own and keeps the names that release reads.
export type SubjectRecord =
  | { readonly target: 'item'; readonly itemID: string; readonly subject: MemorySubject }
  | { readonly target: 'proposal'; readonly proposalID: string; readonly subject: MarkedSubject }
  | {
      readonly target: 'proposal_change';
      readonly proposalID: string;
      readonly subject: MemorySubject;
    };

const itemMarks = new Map<string, MarkedSubject>([
  ['memory.self_noted', 'self'],
  ['memory.shared_noted', 'shared'],
]);

const proposalMarks = new Map<string, MarkedSubject>([
  ['memory.proposal_self_noted', 'self'],
  ['memory.proposal_shared_noted', 'shared'],
]);

export function parseSubjectRecord(record: EnvelopeRecord): SubjectRecord | null {
  if (record.kind === 'memory.subject_changed') {
    return { target: 'item', ...itemChange.parse(record.payload) };
  }

  if (record.kind === 'memory.proposal_subject_changed') {
    return { target: 'proposal_change', ...proposalChange.parse(record.payload) };
  }

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
