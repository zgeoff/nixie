import type { MemorySubject } from './types';

// An item's or a proposal's row, as the subject reads from it.
export interface SubjectRow {
  readonly kind: 'fact' | 'self';
  readonly subject: MemorySubject | null;
}

// The subject of an item's or a proposal's row. A row the release before wrote holds no subject,
// so its kind gives it: self for a self-note, owner for every other row.
export function getRowSubject(row: SubjectRow): MemorySubject {
  return row.subject ?? (row.kind === 'self' ? 'self' : 'owner');
}
