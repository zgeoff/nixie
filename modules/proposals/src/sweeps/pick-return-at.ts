const minuteMs = 60_000;
const dayMinutes = 24 * 60;

export interface QuietHours {
  readonly start: string;
  readonly end: string;
}

// The return time of a defer: deferUntil, or the end of the quiet hours that deferUntil falls in.
export function pickReturnAt(
  deferUntil: number,
  quietHours: QuietHours | null,
  zone: string,
): number {
  if (quietHours === null) {
    return deferUntil;
  }

  const start = toMinutes(quietHours.start);
  const end = toMinutes(quietHours.end);
  const now = toLocalMinutes(deferUntil, zone);
  const isWrapping = start > end;
  const isQuiet = isWrapping ? now >= start || now < end : now >= start && now < end;

  if (!isQuiet || start === end) {
    return deferUntil;
  }

  const wait = (end - now + dayMinutes) % dayMinutes;
  const wholeMinute = Math.floor(deferUntil / minuteMs) * minuteMs;

  return wholeMinute + wait * minuteMs;
}

function toMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');

  return Number(hours) * 60 + Number(minutes);
}

function toLocalMinutes(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));

  const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  return hours * 60 + minutes;
}
