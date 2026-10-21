import type { MemorySubject } from './types';

export interface SubjectRow {
  readonly kind: 'fact' | 'self';
  readonly subject: MemorySubject | null;
}

export function getRowSubject(row: SubjectRow): MemorySubject {
  return row.subject ?? (row.kind === 'self' ? 'self' : 'owner');
}
