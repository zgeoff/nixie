import type { MailArrivalEvent } from '@heynixie/triggers';
import type { ConnectorContext } from '../../../types';
import { readGmailMessage } from '../read-gmail-message';
import { buildGmailArrivalEvent } from './build-gmail-arrival-event';
import { GmailPollError } from './gmail-poll-error';
import type { GmailConnection, PollRun } from './types';

interface ArrivalRead {
  readonly connection: GmailConnection;
  readonly context: ConnectorContext;
  readonly id: string;
}

// The arrival of one added message, or null for a message that is gone or is no arrival. A failed
// read fails the poll, and carries the retry time that Gmail gave.
export async function readGmailArrival(
  run: PollRun,
  request: ArrivalRead,
): Promise<MailArrivalEvent | null> {
  const read = await readGmailMessage(run.input.hosts, request.context, {
    id: request.id,
    format: 'metadata',
  });

  if (read.kind === 'missing') {
    return null;
  }

  if (read.kind === 'failed') {
    throw new GmailPollError(read.reason, read.retryAfterMs);
  }

  return buildGmailArrivalEvent({
    connectionID: request.connection.connectionID,
    connection: request.connection.connection,
    message: read.message,
    occurredAt: new Date(run.input.clock.now()).toISOString(),
  });
}
