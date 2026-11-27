import type { ConnectorContext } from '@heynixie/connections';
import type { GoogleHosts } from '../types';
import { callGmail } from './call-gmail';
import { parseGmailMessage } from './parse-gmail-message';
import type { GmailMessage } from './types';

export type GmailDraftRead =
  | { readonly kind: 'draft'; readonly message: GmailMessage }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed'; readonly reason: string };

// Reads one draft of the account live: the message it holds, with the Bcc header that a draft keeps.
export async function readGmailDraft(
  hosts: GoogleHosts,
  context: ConnectorContext,
  id: string,
): Promise<GmailDraftRead> {
  const reply = await callGmail(hosts, context, {
    path: `/drafts/${encodeURIComponent(id)}`,
    query: { format: 'full' },
  });

  if (reply.kind === 'error') {
    return reply.status === 404 ? { kind: 'missing' } : { kind: 'failed', reason: reply.reason };
  }

  const message =
    typeof reply.body === 'object' && reply.body !== null && 'message' in reply.body
      ? parseGmailMessage(reply.body.message)
      : null;

  return message === null
    ? { kind: 'failed', reason: 'Gmail answered with no draft' }
    : { kind: 'draft', message };
}
