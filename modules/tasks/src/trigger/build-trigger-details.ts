import type { TriggerFired } from '../task/codec/trigger-fired-codec';
import type { LocalTime } from './build-local-time';
import { buildLocalTime } from './build-local-time';

export type DatedFire = Pick<
  TriggerFired,
  'scheduledFor' | 'isCatchUp' | 'skipped' | 'skippedCount'
> & { readonly kind: 'schedule' | 'at' };

export interface TriggerDetails {
  readonly kind: 'schedule' | 'at';

  // local time with its offset, such as '2026-06-04T06:30:00+10:00'
  readonly scheduledFor: string;
  readonly startedAt: string;
  readonly isCatchUp: boolean;

  // the same form, oldest first, at most 20
  readonly skipped: readonly string[];
  readonly skippedCount: number;
  readonly sentence: string;
}

const listedSkipLimit = 20;

// The times of a fire in the zone, and the sentence that says them. The zone is an IANA zone that
// the caller resolved.
export function buildTriggerDetails(
  fire: DatedFire,
  startedAt: Date,
  zone: string,
): TriggerDetails {
  const scheduled = buildLocalTime(new Date(fire.scheduledFor), zone);
  const started = buildLocalTime(startedAt, zone);

  const listed = fire.skipped
    .slice(-listedSkipLimit)
    .map((time) => buildLocalTime(new Date(time), zone));

  return {
    kind: fire.kind,
    scheduledFor: scheduled.iso,
    startedAt: started.iso,
    isCatchUp: fire.isCatchUp,
    skipped: listed.map((time) => time.iso),
    skippedCount: fire.skippedCount,
    sentence: buildSentence(fire, scheduled, started, listed),
  };
}

function buildSentence(
  fire: Pick<TriggerFired, 'isCatchUp' | 'skippedCount'>,
  scheduled: LocalTime,
  started: LocalTime,
  listed: readonly LocalTime[],
): string {
  const isSameDay = isSameDate(scheduled, started);

  const startText = isSameDay
    ? `${started.hour}:${started.minute}`
    : formatDate(started, scheduled);

  const catchUp = fire.isCatchUp ? ' as a catch-up' : '';
  const head = `This task run was scheduled for ${formatDate(scheduled, scheduled)} and started at ${startText}${catchUp}.`;

  if (listed.length === 0 && fire.skippedCount === 0) {
    return head;
  }

  const list = listed.map((time) => formatDate(time, scheduled)).join('; ');

  return fire.skippedCount > listed.length
    ? `${head} Skipped ${String(fire.skippedCount)}, the newest ${String(listed.length)}: ${list}.`
    : `${head} Skipped: ${list}.`;
}

function isSameDate(first: LocalTime, second: LocalTime): boolean {
  return first.year === second.year && first.month === second.month && first.day === second.day;
}

// The year shows only when it differs from the scheduled time's year.
function formatDate(time: LocalTime, scheduled: LocalTime): string {
  const year = time.year === scheduled.year ? '' : ` ${time.year}`;

  return `${time.weekday} ${time.day} ${time.month}${year}, ${time.hour}:${time.minute}`;
}
