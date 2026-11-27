import type { GmailCall } from '../call-gmail';
import { GmailPollError } from './gmail-poll-error';

// The body of an answer, or the failure of the poll that the error says.
export function readOk(reply: GmailCall): unknown {
  if (reply.kind === 'ok') {
    return reply.body;
  }

  throw new GmailPollError(reply.reason, reply.retryAfterMs);
}
