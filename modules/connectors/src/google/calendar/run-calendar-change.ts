import type { ActionAttempt, ProviderResponse } from '../../types';
import { collectStaleMarkerKeys, isMarkerKept } from '../build-action-marker';
import { buildAttemptMarker } from '../build-attempt-marker';
import { callGoogle } from '../call-google';
import { pickGoogleErrorResponse } from '../pick-google-error-response';
import type { GoogleDeps } from '../types';
import { buildEventPatch } from './build-event-patch';
import { buildEventPath } from './build-event-path';
import { buildEventRef } from './build-event-ref';
import { calendarArgumentsSchema } from './calendar-arguments-schema';
import { collectEventDestinations } from './collect-event-destinations';
import { collectOtherAddresses } from './collect-other-addresses';
import { isSameAddresses } from './is-same-addresses';
import { parseCalendarEvent } from './parse-calendar-event';
import { pickEventRefusal } from './pick-event-refusal';
import { readAttemptEvent } from './read-attempt-event';
import { readPreconditionFailure } from './read-precondition-failure';

// The attempt of the change tools. It reads the event again, refuses what the tool must not do to
// it, compares the guests that Google would email with the ones the decision checked, and patches
// the event with the action's marker. A with-guests patch carries the etag of its read.
export async function runCalendarChange(
  deps: GoogleDeps,
  withGuests: boolean,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const parsed = calendarArgumentsSchema.change.safeParse(attempt.arguments);

  const read = await readAttemptEvent(deps, attempt.arguments);

  if (read.kind === 'response') {
    return read.response;
  }

  if (!parsed.success) {
    return { kind: 'refused', reason: 'the arguments of the change are unreadable' };
  }

  if (read.kind === 'gone') {
    return { kind: 'refused', reason: 'UNKNOWN_EVENT: the event is gone' };
  }

  const context = read.context;
  const ref = read.ref;
  const event = read.event;
  const addGuests = collectOtherAddresses(parsed.data.addGuests ?? [], context.account);
  const marker = buildAttemptMarker(attempt, deps.clock.now());

  if (marker.key in event.privateProperties) {
    return {
      kind: 'success',
      result: {
        event: buildEventRef(context.connection, ref.event, ref.calendar),
        link: event.link,
      },
    };
  }

  const destinations = withGuests ? collectEventDestinations(event, addGuests) : [];

  if (withGuests && !isSameAddresses(destinations, attempt.destinations)) {
    return {
      kind: 'destinations_changed',
      reason: 'the guests of the event differ from the ones that were checked',
    };
  }

  const refusal = pickEventRefusal(event, {
    withGuests,
    addGuests,
    removeGuests: parsed.data.removeGuests ?? [],
  });

  if (refusal !== null) {
    return { kind: 'refused', reason: refusal.message };
  }

  const patched = await callGoogle(deps.hosts, context, {
    path: buildEventPath(ref.calendar, ref.event),
    method: 'PATCH',
    query: { sendUpdates: withGuests ? 'all' : 'none' },
    ...(withGuests ? { headers: { 'if-match': event.etag } } : {}),
    json: buildEventPatch(
      event,
      { ...parsed.data, addGuests },
      {
        marker,
        isMarkerKept: isMarkerKept(event.privateProperties, marker),
        staleKeys: collectStaleMarkerKeys(event.privateProperties, marker),
      },
    ),
  });

  if (patched.kind === 'error') {
    return patched.status === 412 && withGuests
      ? readPreconditionFailure(deps, context, { ref, facts: { destinations, addGuests } })
      : pickGoogleErrorResponse(patched);
  }

  const changed = parseCalendarEvent(patched.body, {
    calendar: ref.calendar,
    account: context.account,
  });

  return changed === null
    ? { kind: 'ambiguous', reason: 'Google answered with no event' }
    : {
        kind: 'success',
        result: {
          event: buildEventRef(context.connection, ref.event, ref.calendar),
          link: changed.link,
        },
      };
}
