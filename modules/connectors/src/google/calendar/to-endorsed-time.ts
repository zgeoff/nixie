import { buildEventTime } from './build-event-time';

// A time as the model reads it in a field that cannot carry words: Google's own text when it is a
// date or a date-time, and null for any other text.
export function toEndorsedTime(value: string): string | null {
  return buildEventTime(value) === null ? null : value;
}
