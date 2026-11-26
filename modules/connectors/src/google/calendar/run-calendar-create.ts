import type { ActionAttempt, ProviderResponse } from '../../types';
import { callGoogle } from '../call-google';
import { readCallContext } from '../gmail/read-call-context';
import { pickGoogleErrorResponse } from '../pick-google-error-response';
import { readActionMarker } from '../read-action-marker';
import type { GoogleDeps } from '../types';
import { buildEventInsert } from './build-event-insert';
import { buildEventPath } from './build-event-path';
import { buildEventRef } from './build-event-ref';
import { calendarArgumentsSchema } from './calendar-arguments-schema';
import { primaryCalendar } from './constants';
import { parseCalendarEvent } from './parse-calendar-event';
import { readCalendarEvent } from './read-calendar-event';

// The attempt of the create tools. The event's ID is the action's ID without its hyphens, so a
// retry that Google answers with 409 finds its own event already made, and answers done. A tool
// without guests asks Google to email no one, and a tool with guests asks it to email each.
export async function runCalendarCreate(
  deps: GoogleDeps,
  withGuests: boolean,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  const schema = withGuests
    ? calendarArgumentsSchema.createWithGuests
    : calendarArgumentsSchema.create;

  const parsed = schema.safeParse(attempt.arguments);

  if (context === null) {
    return { kind: 'refused', reason: 'connection_forgotten' };
  }

  if (!parsed.success) {
    return { kind: 'refused', reason: 'the arguments of the event are unreadable' };
  }

  const calendar = parsed.data.calendar ?? primaryCalendar;
  const id = attempt.actionID.replaceAll('-', '');

  const marker = await readActionMarker(deps, attempt.actionID);

  const created = await callGoogle(deps.hosts, context, {
    path: buildEventPath(calendar),
    method: 'POST',
    query: { sendUpdates: withGuests ? 'all' : 'none' },
    json: buildEventInsert(parsed.data, { id, marker }),
  });

  if (created.kind === 'ok') {
    const event = parseCalendarEvent(created.body, { calendar, account: context.account });

    return event === null
      ? { kind: 'ambiguous', reason: 'Google answered with no event' }
      : {
          kind: 'success',
          result: {
            event: buildEventRef(context.connection, event.id, calendar),
            link: event.link,
          },
        };
  }

  if (created.status !== 409) {
    return pickGoogleErrorResponse(created);
  }

  const existing = await readCalendarEvent(deps.hosts, context, { calendar, event: id });

  return existing.kind === 'event'
    ? {
        kind: 'success',
        result: {
          event: buildEventRef(context.connection, id, calendar),
          link: existing.event.link,
        },
      }
    : { kind: 'ambiguous', reason: 'Google refused the event ID, and the event cannot be read' };
}
