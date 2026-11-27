import type { ActionAttempt, CheckResponse } from '@heynixie/connections';
import { readCallContext } from '../gmail/read-call-context';
import { isMarkerLossProvable } from '../marker/build-action-marker';
import { buildAttemptMarker } from '../marker/build-attempt-marker';
import type { GoogleDeps } from '../types';
import { buildEventRef } from './build-event-ref';
import { calendarArgumentsSchema } from './calendar-arguments-schema';
import { calendarToolNames } from './calendar-tool-names';
import { primaryCalendar } from './constants';
import { parseEventRef } from './parse-event-ref';
import { readCalendarEvent } from './read-calendar-event';
import { readMarkedEvent } from './read-marked-event';

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
    const marker = buildAttemptMarker(attempt, deps.clock.now());

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

  const schema =
    attempt.tool === calendarToolNames.createEventWithGuests
      ? calendarArgumentsSchema.createWithGuests
      : calendarArgumentsSchema.create;

  const parsed = schema.partial().safeParse(attempt.arguments);
  const calendar = (parsed.success ? parsed.data.calendar : undefined) ?? primaryCalendar;
  const id = attempt.actionID.replaceAll('-', '');

  const byID = await readCalendarEvent(deps.hosts, context, { calendar, event: id });

  if (byID.kind === 'event') {
    return {
      kind: 'found',
      result: { event: buildEventRef(context.connection, id, calendar), link: byID.event.link },
    };
  }

  const marker = buildAttemptMarker(attempt, deps.clock.now());

  const found = await readMarkedEvent(deps.hosts, context, {
    calendar,
    marker: `${marker.key}=${marker.value}`,
  });

  if (found.kind === 'failed') {
    return { kind: 'inconclusive' };
  }

  if (found.kind === 'event') {
    return {
      kind: 'found',
      result: {
        event: buildEventRef(context.connection, found.event.id, calendar),
        link: found.event.link,
      },
    };
  }

  return byID.kind === 'missing' ? { kind: 'not_found' } : { kind: 'inconclusive' };
}
