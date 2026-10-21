import { onTestFinished } from 'bun:test';

// Bun reads the time zone that the browser reports from TZ.
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
