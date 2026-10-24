import { onTestFinished } from 'bun:test';

// Bun reads the time zone that the browser reports from TZ. With TZ unset, `bun test` runs in UTC,
// but a deleted TZ falls back to the host's own zone, so the cleanup sets the zone back by name.
export function setupBrowserTimeZone(zone: string): void {
  const previous = new Intl.DateTimeFormat().resolvedOptions().timeZone;

  process.env.TZ = zone;

  onTestFinished(() => {
    process.env.TZ = previous;
  });
}
