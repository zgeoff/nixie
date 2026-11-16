import type { LocalDate } from './build-zone-parts';
import { formatLocalDate } from './format-local-date';

// The key of a `day` or `week` fire: the local date and time of the slot.
export function buildSlotKey(definitionID: string, date: LocalDate, clockTime: string): string {
  return `${definitionID}|${formatLocalDate(date)}T${clockTime}`;
}
