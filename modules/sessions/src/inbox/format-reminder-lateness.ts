import { formatGap } from '../message/format-gap';

interface ReminderFireTimes {
  readonly scheduledFor: string;
  readonly firedAt: string;
}

const onTimeLimitMs = 60_000;

// "fired 1 h 39 min late" for a reminder that reaches the conversation more than a minute after its
// due time, or null for one on time. The later of the fire and the delivery counts, because a
// reminder that fires on time still waits when the conversation cannot take a turn.
export function formatReminderLateness(
  fire: ReminderFireTimes,
  deliveredAtMs: number,
): string | null {
  const arrivedAtMs = Math.max(Date.parse(fire.firedAt), deliveredAtMs);
  const lateMs = arrivedAtMs - Date.parse(fire.scheduledFor);

  return lateMs > onTimeLimitMs ? `fired ${formatGap(lateMs)} late` : null;
}
