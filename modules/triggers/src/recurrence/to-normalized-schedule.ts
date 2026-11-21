import type { Hours, Repeat, Schedule } from '@heynixie/contract';

// What an old record needs beyond the repeat that replaces its shape, so it fires at the same times
// as before.
interface LegacyTraits {
  // minute schedules counted from the epoch, not from the start of a local day
  readonly isEpochAnchored: boolean;

  // the old window fired once, at its start, and let a late fire through until its end
  readonly isOncePerWindow: boolean;
  readonly idleMinutes: number | null;
}

export interface NormalizedSchedule {
  readonly repeat: Repeat;
  readonly hours: Hours | null;
  readonly zone: string;
  readonly catchUp: 'once' | 'skip';

  // null for a schedule in the repeat shape
  readonly legacy: LegacyTraits | null;
}

// Both shapes of a stored schedule become the repeat shape: day and at to daily, week and on to
// weekly, hour to hourly, minutes to minutely, and window to hours.
export function toNormalizedSchedule(schedule: Schedule): NormalizedSchedule {
  if ('repeat' in schedule) {
    return {
      repeat: schedule.repeat,
      hours: schedule.hours ?? null,
      zone: schedule.zone,
      catchUp: schedule.catchUp,
      legacy: null,
    };
  }

  const base = { zone: schedule.zone, catchUp: schedule.catchUp };
  const window = schedule.window ?? null;
  const at = window?.from ?? schedule.at;

  const legacy = {
    isEpochAnchored: typeof schedule.every === 'object',
    isOncePerWindow: window !== null,
    idleMinutes: schedule.idleMinutes ?? null,
  };

  if (typeof schedule.every === 'object') {
    return {
      ...base,
      repeat: { frequency: 'minutely', interval: schedule.every.minutes },
      hours: null,
      legacy,
    };
  }

  if (schedule.every === 'hour') {
    return { ...base, repeat: { frequency: 'hourly' }, hours: null, legacy };
  }

  const times = at === undefined ? {} : { at: [at] };

  return {
    ...base,
    repeat:
      schedule.every === 'week'
        ? { frequency: 'weekly', byDay: schedule.on === undefined ? [] : [schedule.on], ...times }
        : { frequency: 'daily', ...times },
    hours: window,
    legacy,
  };
}
