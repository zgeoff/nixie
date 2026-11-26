import type { ActionAttempt, ProviderResponse } from '../../types';
import { callGoogle } from '../call-google';
import { pickGoogleErrorResponse } from '../pick-google-error-response';
import type { GoogleDeps } from '../types';
import { buildEventPath } from './build-event-path';
import { buildEventRef } from './build-event-ref';
import { collectEventDestinations } from './collect-event-destinations';
import { isSameAddresses } from './is-same-addresses';
import { pickEventRefusal } from './pick-event-refusal';
import { readAttemptEvent } from './read-attempt-event';
import { readPreconditionFailure } from './read-precondition-failure';

// The attempt of calendar.cancel_event and calendar.cancel_event_with_guests. An event that Google
// no longer has, or that is cancelled already, counts as cancelled, and so does a 410 on the delete,
// so a retry is safe. A with-guests delete carries the etag of its read.
export async function runCalendarCancel(
  deps: GoogleDeps,
  withGuests: boolean,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const read = await readAttemptEvent(deps, attempt.arguments);

  if (read.kind === 'response') {
    return read.response;
  }

  const context = read.context;
  const ref = read.ref;
  const result = { event: buildEventRef(context.connection, ref.event, ref.calendar) };

  if (read.kind === 'gone' || read.event.status === 'cancelled') {
    return { kind: 'success', result };
  }

  const event = read.event;
  const refusal = pickEventRefusal(event, { withGuests, addGuests: [], removeGuests: [] });

  if (refusal !== null) {
    return { kind: 'refused', reason: refusal.message };
  }

  const destinations = withGuests ? collectEventDestinations(event, []) : [];

  if (withGuests && !isSameAddresses(destinations, attempt.destinations)) {
    return {
      kind: 'destinations_changed',
      reason: 'the guests of the event differ from the ones that were checked',
    };
  }

  const deleted = await callGoogle(deps.hosts, context, {
    path: buildEventPath(ref.calendar, ref.event),
    method: 'DELETE',
    query: { sendUpdates: withGuests ? 'all' : 'none' },
    ...(withGuests ? { headers: { 'if-match': event.etag } } : {}),
  });

  if (deleted.kind === 'ok' || deleted.status === 410) {
    return { kind: 'success', result };
  }

  return deleted.status === 412 && withGuests
    ? readPreconditionFailure(deps, context, { ref, facts: { destinations, addGuests: [] } })
    : pickGoogleErrorResponse(deleted);
}
