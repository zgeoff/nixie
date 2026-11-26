// The path of a calendar's events, or of one event of it, after Google's API origin.
export function buildEventPath(calendar: string, event?: string): string {
  const base = `/calendar/v3/calendars/${encodeURIComponent(calendar)}/events`;

  return event === undefined ? base : `${base}/${encodeURIComponent(event)}`;
}
