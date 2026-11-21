import { buildZoneParts } from '@heynixie/clock';
import type { RepeatSchedule } from '@heynixie/contract';
import { collectNextFires } from '../time/collect-next-fires';
import { formatLocalDate } from '../time/format-local-date';
import { checkScheduleShape } from './check-schedule-shape';
import type { ScheduleRefusal } from './check-schedule-shape';

export type ScheduleCheck =
  | { readonly status: 'ok'; readonly schedule: RepeatSchedule }
  | ({ readonly status: 'refused' } & ScheduleRefusal);

export interface ScheduleFacts {
  // epoch milliseconds
  readonly nowMs: number;

  // the owner's zone, for a schedule whose zone is `owner`
  readonly ownerZone: string;

  // the shortest gap between 2 of the next fires
  readonly minGapMinutes: number;
}

// How many of the next fires the check looks at, and how far ahead the first one may lie.
const checkedFires = 60;
const horizonMs = 400 * 24 * 3_600_000;
const minuteMs = 60_000;

// Pure. Refuses a mix of fields that never go together, then fills the start date, then refuses a
// schedule with no fire in the 400 days after now or its start date, whichever is later, and next fires closer than the minimum gap.
export function checkSchedule(given: RepeatSchedule, facts: ScheduleFacts): ScheduleCheck {
  const zone = given.zone === 'owner' ? facts.ownerZone : given.zone;
  const shape = checkScheduleShape(given);

  if (shape !== null) {
    return { status: 'refused', ...shape };
  }

  const schedule = buildFilledSchedule(given, facts.nowMs, zone);

  const fires = collectNextFires(
    'check',
    { schedule },
    {
      afterMs: facts.nowMs,
      zone,
      count: checkedFires,
    },
  );

  const [first] = fires;

  if (
    first === undefined ||
    first.scheduledFor > horizonStartMs(schedule, facts.nowMs) + horizonMs
  ) {
    return {
      status: 'refused',
      code: 'NO_FIRE',
      path: 'repeat',
      sentence:
        'This schedule has no fire in the next 400 days. Check that its days, months and hours ' +
        'leave a time that exists, such as a byMonthDay that its byMonth reaches, and a time in at ' +
        'that lies inside hours.',
    };
  }

  const gapMs = fires.reduce(
    (smallest, fire, index) =>
      index === 0
        ? smallest
        : Math.min(smallest, fire.scheduledFor - (fires[index - 1]?.scheduledFor ?? 0)),
    Number.POSITIVE_INFINITY,
  );

  if (gapMs < facts.minGapMinutes * minuteMs) {
    return {
      status: 'refused',
      code: 'MIN_GAP',
      path: 'repeat',
      sentence: `A schedule fires at most every ${facts.minGapMinutes} minutes, and 2 of its next fires lie closer than that. Widen the interval, or drop a time from at.`,
    };
  }

  return { status: 'ok', schedule };
}

// The schedule with the start date it counts from, and its times in order with none twice.
function buildFilledSchedule(given: RepeatSchedule, nowMs: number, zone: string): RepeatSchedule {
  const starts = given.repeat.starts ?? formatLocalDate(buildZoneParts(nowMs, zone));
  const at = given.repeat.at === undefined ? {} : { at: [...new Set(given.repeat.at)].toSorted() };

  return { ...given, repeat: { ...given.repeat, ...at, starts } };
}

// The 400 days count from now, or from the start date when that lies later, so a schedule that
// starts months ahead is judged the same whatever clock checks it.
function horizonStartMs(schedule: RepeatSchedule, nowMs: number): number {
  const startsMs = Date.parse(`${schedule.repeat.starts ?? ''}T00:00:00Z`);

  return Number.isNaN(startsMs) ? nowMs : Math.max(nowMs, startsMs);
}
