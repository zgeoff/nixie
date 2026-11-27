import type { ConnectorContext, ProviderResponse } from '@heynixie/connections';
import type { GoogleDeps } from '../types';
import { collectEventDestinations } from './collect-event-destinations';
import { isSameAddresses } from './is-same-addresses';
import { readCalendarEvent } from './read-calendar-event';
import type { EventRef } from './types';

interface PreconditionFacts {
  // the destinations the decision checked
  readonly destinations: readonly string[];
  readonly addGuests: readonly string[];
}

interface PreconditionRequest {
  readonly ref: EventRef;
  readonly facts: PreconditionFacts;
}

// What Google's 412 means for a with-guests write: the event changed after the attempt read it.
// When its guests now differ from the ones the decision checked, the action fails and emails none
// of them. Otherwise the attempt can retry.
export async function readPreconditionFailure(
  deps: GoogleDeps,
  context: ConnectorContext,
  request: PreconditionRequest,
): Promise<ProviderResponse> {
  const read = await readCalendarEvent(deps.hosts, context, request.ref);

  if (read.kind === 'event') {
    const now = collectEventDestinations(read.event, request.facts.addGuests);

    if (!isSameAddresses(now, request.facts.destinations)) {
      return {
        kind: 'destinations_changed',
        reason: 'the guests of the event differ from the ones that were checked',
      };
    }
  }

  return {
    kind: 'refused_retryable',
    reason: 'CHANGED: the event changed after it was read, and nothing was sent',
  };
}
