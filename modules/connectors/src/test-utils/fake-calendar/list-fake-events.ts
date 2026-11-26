import { parseFakePrivate } from './parse-fake-private';
import { parseFakeStart } from './parse-fake-start';
import type { FakeCalendar, StoredEvent } from './types';

// The events.list of a calendar: the events in the time range, with a matching title and marker, in
// the order they start, in pages. A cancelled event shows only for `showDeleted`.
export function listFakeEvents(calendar: FakeCalendar, calendarID: string, url: URL): Response {
  const from = Date.parse(url.searchParams.get('timeMin') ?? '');
  const to = Date.parse(url.searchParams.get('timeMax') ?? '');
  const query = (url.searchParams.get('q') ?? '').toLowerCase();
  const showDeleted = url.searchParams.get('showDeleted') === 'true';
  const marker = url.searchParams.get('privateExtendedProperty');
  const limit = Number(url.searchParams.get('maxResults') ?? 250);
  const offset = Number(url.searchParams.get('pageToken') ?? 0);

  const matching = [...(calendar.events.get(calendarID)?.values() ?? [])]
    .filter((event) => showDeleted || event['status'] !== 'cancelled')
    .filter((event) => isInRange(event, from, to))
    .filter((event) => query === '' || String(event['summary']).toLowerCase().includes(query))
    .filter((event) => marker === null || hasMarker(event, marker))
    .toSorted((left, right) => parseFakeStart(left) - parseFakeStart(right));

  const page = matching.slice(offset, offset + limit);
  const next = offset + limit < matching.length ? String(offset + limit) : undefined;

  return Response.json({ items: page, ...(next === undefined ? {} : { nextPageToken: next }) });
}

function isInRange(event: StoredEvent, fromMs: number, toMs: number): boolean {
  const start = parseFakeStart(event);

  return (Number.isNaN(fromMs) || start >= fromMs) && (Number.isNaN(toMs) || start < toMs);
}

function hasMarker(event: StoredEvent, expression: string): boolean {
  const [key = '', value = ''] = expression.split('=');

  return parseFakePrivate(event)[key] === value;
}
