import type { ConnectorContext } from '../../types';
import type { GoogleHosts } from '../google-hosts';
import { callGmail } from './call-gmail';

export type GmailRawRead =
  | { readonly kind: 'raw'; readonly text: string }
  | { readonly kind: 'failed'; readonly reason: string };

// Reads one message live in its raw form, as the base64url text that Gmail keeps.
export async function readGmailRaw(
  hosts: GoogleHosts,
  context: ConnectorContext,
  id: string,
): Promise<GmailRawRead> {
  const reply = await callGmail(hosts, context, {
    path: `/messages/${encodeURIComponent(id)}`,
    query: { format: 'raw' },
  });

  if (reply.kind === 'error') {
    return { kind: 'failed', reason: reply.reason };
  }

  const text =
    typeof reply.body === 'object' && reply.body !== null && 'raw' in reply.body
      ? reply.body.raw
      : null;

  return typeof text === 'string'
    ? { kind: 'raw', text }
    : { kind: 'failed', reason: 'Gmail answered with no raw message' };
}
