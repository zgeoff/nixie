import type { ConnectorContext } from '@heynixie/connections';
import { callGoogle } from '../call/call-google';
import type { GoogleHosts } from '../connector/google-hosts';
import { buildEventPath } from './build-event-path';

// Whether the account owns the calendar. Google's answer to an event list names the account's role
// on the calendar, which the Calendar events scope can read where the calendar list scope cannot.
export async function readCalendarOwnership(
  hosts: GoogleHosts,
  context: ConnectorContext,
  calendar: string,
): Promise<boolean> {
  const reply = await callGoogle(hosts, context, {
    path: buildEventPath(calendar),
    query: { maxResults: '1', fields: 'accessRole' },
  });

  return (
    reply.kind === 'ok' &&
    typeof reply.body === 'object' &&
    reply.body !== null &&
    'accessRole' in reply.body &&
    reply.body.accessRole === 'owner'
  );
}
