import type { ConnectorContext } from '@heynixie/connections';
import { callGoogle } from '../call/call-google';
import type { GoogleHosts } from '../connector/google-hosts';
import { buildEventPath } from './build-event-path';
import { eventListSchema, parseCalendarEvent } from './parse-calendar-event';
import type { CalendarEvent } from './types';

interface MarkedEventRequest {
  readonly calendar: string;

  // `name=value` of the private property that the attempt wrote
  readonly marker: string;
}

export type MarkedEventRead =
  | { readonly kind: 'event'; readonly event: CalendarEvent }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed' };

// Searches a calendar for the event that holds an attempt's marker, cancelled events included. It
// follows every page, because Google may answer an empty page that has a next one.
export async function readMarkedEvent(
  hosts: GoogleHosts,
  context: ConnectorContext,
  request: MarkedEventRequest,
): Promise<MarkedEventRead> {
  let pageToken: string | undefined;

  do {
    const listed = await callGoogle(hosts, context, {
      path: buildEventPath(request.calendar),
      query: {
        privateExtendedProperty: request.marker,
        showDeleted: 'true',
        maxResults: '5',
        ...(pageToken === undefined ? {} : { pageToken }),
      },
    });

    const items = listed.kind === 'ok' ? eventListSchema.safeParse(listed.body) : null;

    if (items === null || !items.success) {
      return { kind: 'failed' };
    }

    for (const item of items.data.items ?? []) {
      const event = parseCalendarEvent(item, {
        calendar: request.calendar,
        account: context.account,
      });

      if (event !== null) {
        return { kind: 'event', event };
      }
    }

    pageToken = items.data.nextPageToken;
  } while (pageToken !== undefined);

  return { kind: 'none' };
}
