import { buildEventTime } from './build-event-time';

// Whether the text is a date-time with an offset, such as 2026-11-14T09:30:00+11:00.
export function isEventDateTime(value: string): boolean {
  return buildEventTime(value) !== null && value.includes('T');
}
