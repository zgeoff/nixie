import type { ConnectorContext, JSONObject, ProviderResponse } from '@heynixie/connections';
import { readCallContext } from '../gmail/read-call-context';
import type { GoogleDeps } from '../types';
import { parseEventRef } from './parse-event-ref';
import { readCalendarEvent } from './read-calendar-event';
import type { CalendarEvent, EventRef } from './types';

export type AttemptEvent =
  | {
      readonly kind: 'event';
      readonly context: ConnectorContext;
      readonly ref: EventRef;
      readonly event: CalendarEvent;
    }
  | {
      readonly kind: 'gone';
      readonly context: ConnectorContext;
      readonly ref: EventRef;
    }
  | { readonly kind: 'response'; readonly response: ProviderResponse };

// What an attempt on an existing event reads as it begins: the connection, and the event as Google
// holds it now. A forgotten connection and an unreadable call refuse, a failed read can be retried,
// and an event that Google no longer has reads as gone.
export async function readAttemptEvent(deps: GoogleDeps, args: JSONObject): Promise<AttemptEvent> {
  const context = await readCallContext(deps.access, args);

  const text = args['event'];
  const ref = typeof text === 'string' ? parseEventRef(text) : null;

  if (context === null) {
    return { kind: 'response', response: { kind: 'refused', reason: 'connection_forgotten' } };
  }

  if (ref === null) {
    return {
      kind: 'response',
      response: { kind: 'refused', reason: 'the arguments of the call are unreadable' },
    };
  }

  const read = await readCalendarEvent(deps.hosts, context, ref);

  if (read.kind === 'missing') {
    return { kind: 'gone', context, ref };
  }

  if (read.kind === 'failed') {
    return {
      kind: 'response',
      response: {
        kind: 'refused_retryable',
        reason: `GOOGLE_FAILED: ${read.reason}`,
        ...(read.retryAfterMs === null ? {} : { retryAfterMs: read.retryAfterMs }),
      },
    };
  }

  return { kind: 'event', context, ref, event: read.event };
}
