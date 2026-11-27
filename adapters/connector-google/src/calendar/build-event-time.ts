import { datePattern, dateTimePattern } from './constants';
import type { EventTimeField } from './types';

// The `start` or `end` that Google takes from a model's time. Null for text that is neither a date
// nor a date-time with an offset.
export function buildEventTime(value: string): EventTimeField | null {
  if (datePattern.test(value) && !Number.isNaN(Date.parse(value))) {
    return { date: value };
  }

  return dateTimePattern.test(value) && !Number.isNaN(Date.parse(value))
    ? { dateTime: value }
    : null;
}
