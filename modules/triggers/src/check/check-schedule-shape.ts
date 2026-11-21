import type { RepeatSchedule } from '@heynixie/contract';

export interface ScheduleRefusal {
  readonly code:
    | 'AT_REQUIRED'
    | 'AT_NOT_ALLOWED'
    | 'NTH_NOT_ALLOWED'
    | 'BY_MONTH_DAY_NOT_ALLOWED'
    | 'STARTS_REQUIRED'
    | 'NO_FIRE'
    | 'MIN_GAP';

  // the field the refusal is about, such as `repeat.at`
  readonly path: string;

  // what to change, in a sentence
  readonly sentence: string;
}

// Pure, with no clock. Refuses the fields of a schedule that never go together. The rules a
// schema cannot say per field live here, so each comes back with a code, a path and a fix.
export function checkScheduleShape(schedule: RepeatSchedule): ScheduleRefusal | null {
  const repeat = schedule.repeat;
  const isElapsed = repeat.frequency === 'minutely' || repeat.frequency === 'hourly';

  if (!isElapsed && repeat.at === undefined) {
    return {
      code: 'AT_REQUIRED',
      path: 'repeat.at',
      sentence: `A ${repeat.frequency} schedule needs the times of day it fires: add repeat.at, such as ["09:00"].`,
    };
  }

  if (isElapsed && repeat.at !== undefined) {
    return {
      code: 'AT_NOT_ALLOWED',
      path: 'repeat.at',
      sentence: `A ${repeat.frequency} schedule fires on a count of ${repeat.frequency === 'hourly' ? 'hours' : 'minutes'}, so drop repeat.at. To limit it to a part of the day, set hours, or use a daily schedule with repeat.at.`,
    };
  }

  const hasNth = (repeat.byDay ?? []).some(
    (entry) => typeof entry === 'object' && entry.nth !== undefined,
  );

  if (hasNth && repeat.frequency !== 'monthly' && repeat.frequency !== 'yearly') {
    return {
      code: 'NTH_NOT_ALLOWED',
      path: 'repeat.byDay',
      sentence: `A ${repeat.frequency} schedule cannot name the nth weekday of a month. Drop nth, or set frequency to monthly.`,
    };
  }

  if (repeat.byMonthDay !== undefined && repeat.frequency === 'weekly') {
    return {
      code: 'BY_MONTH_DAY_NOT_ALLOWED',
      path: 'repeat.byMonthDay',
      sentence:
        'A weekly schedule fires on weekdays, so drop repeat.byMonthDay, or set frequency to monthly.',
    };
  }

  if ((repeat.interval ?? 1) > 1 && repeat.starts === undefined) {
    return {
      code: 'STARTS_REQUIRED',
      path: 'repeat.starts',
      sentence:
        'A schedule with an interval above 1 counts from a start date: add repeat.starts, such as "2026-11-23".',
    };
  }

  return null;
}
