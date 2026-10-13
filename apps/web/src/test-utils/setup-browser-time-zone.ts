import { onTestFinished } from 'bun:test';

// Sets the time zone that the browser reports, which Bun reads from TZ, and restores the zone the
// run had when the test finishes.
export function setupBrowserTimeZone(zone: string): void {
  const previous = process.env.TZ;

  process.env.TZ = zone;
  onTestFinished(() => {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  });
}
