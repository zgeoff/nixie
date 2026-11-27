import type { ConnectionArrivalEvent } from '@heynixie/triggers';
import { buildGmailMailbox } from '../build-gmail-mailbox';
import { buildItemID } from '../build-item-id';
import { collectAddresses } from '../collect-addresses';
import { decodeHeaderWords } from '../decode-header-words';
import type { GmailMessage } from '../types';

// A mail with one of these labels never meets a rule: a mail you send, or the assistant sends, is
// not an arrival.
const skippedLabels: ReadonlySet<string> = new Set(['SENT', 'DRAFT', 'SPAM', 'TRASH']);

export interface GmailArrivalInput {
  readonly connectionID: string;

  // the connection's short ID, the prefix of the IDs that a Gmail tool takes
  readonly connection: string;
  readonly message: GmailMessage;
  readonly occurredAt: string;
}

// The arrival of one new message, or null for a message that is no arrival. The message ID is the
// one that gmail.read takes, and the thread ID is Gmail's own, which a rule's thread matches.
export function buildGmailArrivalEvent(input: GmailArrivalInput): ConnectionArrivalEvent | null {
  const message = input.message;

  if (message.labels.some((label) => skippedLabels.has(label))) {
    return null;
  }

  const [from] = collectAddresses(message.payload.headers.get('from'));

  return {
    kind: 'mail',
    mailbox: buildGmailMailbox(input.connectionID),
    dedupeKey: `${input.connectionID}|${message.id}`,
    occurredAt: input.occurredAt,
    payload: {
      messageID: buildItemID(input.connection, message.id),
      threadID: message.threadID,
      receivedAt: message.internalDateMs,
      from: from ?? '',
      subject: decodeHeaderWords(message.payload.headers.get('subject') ?? ''),
    },
  };
}
