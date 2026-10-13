// Whether this runtime knows the zone as a time zone, such as Europe/London. A browser can know a
// zone that an older server does not, so the server drops a zone it does not know, never the
// message that carries it.
export function isTimeZone(zone: string): boolean {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone !== '';
  } catch {
    return false;
  }
}
