import { buildZoneParts } from '@heynixie/clock';
import type { ArmedRow } from '../arm/read-armed-definitions';
import { catchUpThresholdMs, maxSkippedSlots } from '../core/constants';
import type { NormalizedSchedule } from '../recurrence/to-normalized-schedule';
import { toNormalizedSchedule } from '../recurrence/to-normalized-schedule';
import type { NextFire } from '../time/pick-next-fire';
import { isWithinHours, pickNextFire, pickScheduleFire } from '../time/pick-next-fire';
import type { TriggerEvent } from '../types';
import { getIntervalMs } from './get-interval-ms';

export interface ScheduleEventInput {
  readonly row: ArmedRow;

  // the IANA zone: the caller has resolved 'owner'
  readonly zone: string;
  readonly nowMs: number;

  // the time of the newest owner message, or null when there is none
  readonly lastMessageAtMs: number | null;
}

// The event of one armed definition at one tick, or null when it has nothing to deliver. The slots
// from the watermark up to now collapse into one event: the newest is the fire, and the earlier ones
// are the missed. Pure over the runtime's zone data.
export function pickScheduleEvent(input: ScheduleEventInput): TriggerEvent | null {
  const row = input.row;
  const nowMs = input.nowMs;

  if ('at' in row.trigger) {
    return pickOneShotEvent(input);
  }

  const schedule = toNormalizedSchedule(row.trigger.schedule);
  const walk = walkDueSlots(input, schedule);

  if (walk === null) {
    return null;
  }

  const decision = pickDecision(input, schedule, walk.newest);

  if (decision.kind === 'wait') {
    return null;
  }

  return {
    definitionID: row.definitionID,
    definitionHash: row.definitionHash,
    kind: 'schedule',
    dedupeKey: walk.newest.dedupeKey,
    scheduledFor: new Date(walk.newest.scheduledFor).toISOString(),
    occurredAt: new Date(nowMs).toISOString(),
    missed: walk.missed.map((slot) => new Date(slot).toISOString()),
    missedCount: walk.missedCount,
    ...(decision.kind === 'skip' ? { skip: decision.reason } : {}),
    payload: null,
  };
}

// A one-shot fires however late it is, and never skips.
function pickOneShotEvent(input: ScheduleEventInput): TriggerEvent | null {
  const row = input.row;
  const nowMs = input.nowMs;
  const slot = pickNextFire(row.definitionID, row.trigger, row.after, input.zone);

  if (slot === null || slot.scheduledFor > nowMs) {
    return null;
  }

  return {
    definitionID: row.definitionID,
    definitionHash: row.definitionHash,
    kind: 'at',
    dedupeKey: slot.dedupeKey,
    scheduledFor: new Date(slot.scheduledFor).toISOString(),
    occurredAt: new Date(nowMs).toISOString(),
    missed: [],
    missedCount: 0,
    payload: null,
  };
}

interface DueSlots {
  readonly newest: NextFire;

  // the newest of the earlier slots, oldest first, at most maxSkippedSlots
  readonly missed: readonly number[];
  readonly missedCount: number;
}

// Walks the slots after the watermark that are due, and keeps only the newest few in memory.
function walkDueSlots(input: ScheduleEventInput, schedule: NormalizedSchedule): DueSlots | null {
  const row = input.row;
  const nowMs = input.nowMs;
  let newest: NextFire | null = null;
  let afterMs = row.after;
  let missedCount = 0;
  const missed: number[] = [];

  for (;;) {
    const slot = pickScheduleFire(row.definitionID, schedule, afterMs, input.zone);

    if (slot === null || slot.scheduledFor > nowMs || isHeld(row.hold, slot, nowMs)) {
      break;
    }

    if (newest !== null) {
      missed.push(newest.scheduledFor);

      missedCount += 1;

      if (missed.length > maxSkippedSlots) {
        missed.shift();
      }
    }

    newest = slot;
    afterMs = slot.scheduledFor;
  }

  return newest === null ? null : { newest, missed, missedCount };
}

// A snoozed slot waits for the end of its hold, and the slots after it wait behind it.
function isHeld(hold: ArmedRow['hold'], slot: NextFire, nowMs: number): boolean {
  return hold !== null && slot.scheduledFor === hold.slot && nowMs < hold.until;
}

type Skip = NonNullable<TriggerEvent['skip']>;

// What the source does with a slot that is due: fire it, skip it, or wait for a later tick.
type Decision =
  | { readonly kind: 'fire' }
  | { readonly kind: 'wait' }
  | { readonly kind: 'skip'; readonly reason: Skip };

function pickDecision(
  input: ScheduleEventInput,
  schedule: NormalizedSchedule,
  newest: NextFire,
): Decision {
  const nowMs = input.nowMs;

  // a slot that a snooze held fires when its hold ends, however late that is
  if (input.row.hold?.slot === newest.scheduledFor) {
    return { kind: 'fire' };
  }

  if (schedule.hours !== null && newest.until !== null) {
    if (schedule.legacy?.idleMinutes !== null && schedule.legacy?.idleMinutes !== undefined) {
      return pickIdleWindowDecision(input, schedule.legacy.idleMinutes, newest.until);
    }

    if (nowMs <= newest.until) {
      return { kind: 'fire' };
    }
  }

  const lateMs = nowMs - newest.scheduledFor;

  if (lateMs <= catchUpThresholdMs) {
    return { kind: 'fire' };
  }

  if (schedule.catchUp === 'skip') {
    return { kind: 'skip', reason: 'catch_up_off' };
  }

  if (schedule.legacy === null && isOutsideHours(schedule, nowMs, input.zone)) {
    return { kind: 'skip', reason: 'too_late' };
  }

  return lateMs <= getIntervalMs(schedule.repeat) / 2
    ? { kind: 'fire' }
    : { kind: 'skip', reason: 'too_late' };
}

const minuteMs = 60_000;

// A window with idleMinutes fires once the conversation has been quiet that long, and is closed for
// good at the end of the window.
function pickIdleWindowDecision(
  input: ScheduleEventInput,
  idleMinutes: number,
  untilMs: number,
): Decision {
  if (input.nowMs > untilMs) {
    return { kind: 'skip', reason: 'window_closed' };
  }

  const lastMessageAtMs = input.lastMessageAtMs;

  const isIdle =
    lastMessageAtMs === null || input.nowMs - lastMessageAtMs >= idleMinutes * minuteMs;

  return isIdle ? { kind: 'fire' } : { kind: 'wait' };
}

// The hours of a schedule in the repeat shape limit when it fires, so a late slot waits for no later
// hours: it is skipped.
function isOutsideHours(schedule: NormalizedSchedule, nowMs: number, zone: string): boolean {
  if (schedule.hours === null) {
    return false;
  }

  const parts = buildZoneParts(nowMs, zone);

  return !isWithinHours(schedule.hours, parts.hour * 60 + parts.minute);
}
