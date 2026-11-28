import type { ConnectorContext } from '@heynixie/connections';
import type { ConnectorFailure } from '@heynixie/tools';
import { buildGoogleFailure } from '../call/build-google-failure';
import { buildUnreadableFailure } from '../call/build-unreadable-failure';
import type { GoogleHosts } from '../types';
import { callGmail } from './call-gmail';
import { parseGmailMessage } from './parse-gmail-message';
import type { GmailMessage } from './types';

export type GmailMessageRead =
  | { readonly kind: 'message'; readonly message: GmailMessage }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'failed';
      readonly reason: string;

      // the retry time that Gmail gave, in ms
      readonly retryAfterMs: number | null;
      readonly failure: ConnectorFailure;
    };

const metadataHeaders = [
  'From',
  'To',
  'Cc',
  'Subject',
  'Date',
  'Reply-To',
  'Message-ID',
  'X-Google-Original-Message-ID',
];

interface MessageRequest {
  readonly id: string;
  readonly format: 'full' | 'metadata';
}

// Reads one message live from Gmail: whole with `full`, or its headers with `metadata`. A miss is a
// value; any other failure carries Gmail's reason.
export async function readGmailMessage(
  hosts: GoogleHosts,
  context: ConnectorContext,
  request: MessageRequest,
): Promise<GmailMessageRead> {
  const reply = await callGmail(hosts, context, {
    path: `/messages/${encodeURIComponent(request.id)}`,
    query: request.format === 'full' ? { format: 'full' } : { format: 'metadata', metadataHeaders },
  });

  if (reply.kind === 'error') {
    return reply.status === 404
      ? { kind: 'missing' }
      : {
          kind: 'failed',
          reason: reply.reason,
          retryAfterMs: reply.retryAfterMs,
          failure: buildGoogleFailure(reply),
        };
  }

  const message = parseGmailMessage(reply.body);

  return message === null
    ? {
        kind: 'failed',
        reason: 'Gmail answered with no message',
        retryAfterMs: null,
        failure: buildUnreadableFailure('Gmail answered with no message'),
      }
    : { kind: 'message', message };
}
