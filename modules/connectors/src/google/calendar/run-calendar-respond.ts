import type { ActionAttempt, ProviderResponse } from '../../types';
import { callGoogle } from '../call-google';
import { pickGoogleErrorResponse } from '../pick-google-error-response';
import type { GoogleDeps } from '../types';
import { buildEventPath } from './build-event-path';
import { buildEventRef } from './build-event-ref';
import { buildRespondPatch } from './build-respond-patch';
import { calendarArgumentsSchema } from './calendar-arguments-schema';
import { isSameAddresses } from './is-same-addresses';
import { readAttemptEvent } from './read-attempt-event';

// The attempt of calendar.respond: sets the account's own response on an event and asks Google to
// email the organizer. It reads the event again, and when the organizer is not the address the
// decision checked, it fails and emails no one.
export async function runCalendarRespond(
  deps: GoogleDeps,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const parsed = calendarArgumentsSchema.respond.safeParse(attempt.arguments);

  const read = await readAttemptEvent(deps, attempt.arguments);

  if (read.kind === 'response') {
    return read.response;
  }

  if (!parsed.success) {
    return { kind: 'refused', reason: 'the arguments of the response are unreadable' };
  }

  if (read.kind === 'gone') {
    return { kind: 'refused', reason: 'UNKNOWN_EVENT: the event is gone' };
  }

  const context = read.context;
  const ref = read.ref;
  const event = read.event;

  if (event.yourResponse === null) {
    return {
      kind: 'refused',
      reason: 'NOT_INVITED: the connected account is no guest of this event',
    };
  }

  const organizers = event.organizer === null ? [] : [event.organizer];

  if (!isSameAddresses(organizers, attempt.destinations)) {
    return {
      kind: 'destinations_changed',
      reason: 'the organizer of the event differs from the one that was checked',
    };
  }

  const patched = await callGoogle(deps.hosts, context, {
    path: buildEventPath(ref.calendar, ref.event),
    method: 'PATCH',
    query: { sendUpdates: 'all' },
    json: buildRespondPatch(event, { account: context.account, response: parsed.data.response }),
  });

  return patched.kind === 'error'
    ? pickGoogleErrorResponse(patched)
    : {
        kind: 'success',
        result: { event: buildEventRef(context.connection, ref.event, ref.calendar) },
      };
}
