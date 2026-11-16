import type { MemorySubject } from '../types';
import type { IndexRow } from './read-index-rows';

export function filterSubjectRows(
  rows: readonly IndexRow[],
  subjects: readonly MemorySubject[] | undefined,
): readonly IndexRow[] {
  return subjects === undefined ? rows : rows.filter((row) => subjects.includes(row.subject));
}
