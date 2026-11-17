import { buildZoneOffsetMs } from '@heynixie/triggers';

// The seconds truncate, so a time that marks a limit never lies past it.
export function formatZonedISO(instantMs: number, zone: string): string {
  const offsetMs = buildZoneOffsetMs(instantMs, zone);

  const local = new Date(instantMs + offsetMs).toISOString().slice(0, 19);

  return `${local}${formatOffset(offsetMs)}`;
}

const minuteMs = 60_000;

function formatOffset(offsetMs: number): string {
  const totalMinutes = Math.abs(offsetMs) / minuteMs;
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');

  return `${offsetMs < 0 ? '-' : '+'}${hours}:${minutes}`;
}
