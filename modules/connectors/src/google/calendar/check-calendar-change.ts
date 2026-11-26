import type { ActionAttempt, CheckResponse } from '../../types';
import { isMarkerLossProvable } from '../build-action-marker';
import { callGoogle } from '../call-google';
import { readCallContext } from '../gmail/read-call-context';
import { readActionMarker } from '../read-action-marker';
import type { GoogleDeps } from '../types';
import { buildEventPath } from './build-event-path';
import { buildEventRef } from './build-event-ref';
import { calendarArgumentsSchema } from './calendar-arguments-schema';
import { calendarToolNames } from './calendar-tool-names';
import { primaryCalendar } from './constants';
import { eventListSchema, parseCalendarEvent } from './parse-calendar-event';
import { parseEventRef } from './parse-event-ref';
import { readCalendarEvent } from './read-calendar-event';

const createTools: ReadonlySet<string> = new Set([
  calendarToolNames.createEvent,
  calendarToolNames.createEventWithGuests,
]);

const changeTools: ReadonlySet<string> = new Set([
  calendarToolNames.changeEvent,
  calendarToolNames.changeEventWithGuests,
]);

const cancelTools: ReadonlySet<string> = new Set([
  calendarToolNames.cancelEvent,
  calendarToolNames.cancelEventWithGuests,
]);

// The read-only check of a Calendar write of unknown outcome. Found wins over every other answer,
// and a failed read or an answer that no row names is inconclusive.
export async function checkCalendarChange(
  deps: GoogleDeps,
  attempt: ActionAttempt,
): Promise<CheckResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  if (context === null) {
    return { kind: 'inconclusive' };
  }

  if (createTools.has(attempt.tool)) {
    return checkCreate(deps, { context, attempt });
  }

  const text = attempt.arguments['event'];
  const ref = typeof text === 'string' ? parseEventRef(text) : null;

  if (ref === null) {
    return { kind: 'inconclusive' };
  }

  const read = await readCalendarEvent(deps.hosts, context, ref);

  const result = { event: buildEventRef(context.connection, ref.event, ref.calendar) };

  if (cancelTools.has(attempt.tool)) {
    if (read.kind === 'missing' || (read.kind === 'event' && read.event.status === 'cancelled')) {
      return { kind: 'found', result };
    }

    return read.kind === 'event' ? { kind: 'not_found' } : { kind: 'inconclusive' };
  }

  if (read.kind !== 'event') {
    return { kind: 'inconclusive' };
  }

  if (changeTools.has(attempt.tool)) {
    const marker = await readActionMarker(deps, attempt.actionID);

    if (marker.key in read.event.privateProperties) {
      return { kind: 'found', result: { ...result, link: read.event.link } };
    }

    return isMarkerLossProvable(read.event.privateProperties)
      ? { kind: 'not_found' }
      : { kind: 'inconclusive' };
  }

  const response = calendarArgumentsSchema.respond.safeParse(attempt.arguments);

  return response.success && read.event.yourResponse === response.data.response
    ? { kind: 'found', result }
    : { kind: 'inconclusive' };
}

interface CreateCheck {
  readonly context: NonNullable<Awaited<ReturnType<typeof readCallContext>>>;
  readonly attempt: ActionAttempt;
}

async function checkCreate(deps: GoogleDeps, check: CreateCheck): Promise<CheckResponse> {
  const context = check.context;
  const attempt = check.attempt;
  const parsed = calendarArgumentsSchema.create.partial().safeParse(attempt.arguments);
  const calendar = (parsed.success ? parsed.data.calendar : undefined) ?? primaryCalendar;
  const id = attempt.actionID.replaceAll('-', '');

  const byID = await readCalendarEvent(deps.hosts, context, { calendar, event: id });

  if (byID.kind === 'event') {
    return {
      kind: 'found',
      result: { event: buildEventRef(context.connection, id, calendar), link: byID.event.link },
    };
  }

  const marker = await readActionMarker(deps, attempt.actionID);

  const listed = await callGoogle(deps.hosts, context, {
    path: buildEventPath(calendar),
    query: {
      privateExtendedProperty: `${marker.key}=${marker.value}`,
      showDeleted: 'true',
      maxResults: '5',
    },
  });

  const items = listed.kind === 'ok' ? eventListSchema.safeParse(listed.body) : null;

  if (items === null || !items.success) {
    return { kind: 'inconclusive' };
  }

  const [first] = (items.data.items ?? []).flatMap((item) => {
    const event = parseCalendarEvent(item, { calendar, account: context.account });

    return event === null ? [] : [event];
  });

  if (first !== undefined) {
    return {
      kind: 'found',
      result: { event: buildEventRef(context.connection, first.id, calendar), link: first.link },
    };
  }

  return byID.kind === 'missing' ? { kind: 'not_found' } : { kind: 'inconclusive' };
}
