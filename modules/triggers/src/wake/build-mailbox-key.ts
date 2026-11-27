import type { Mailbox } from '../types';

// The one text form that tables store for a mailbox: `mail`, or the source, a colon and the
// connection's ID.
export function buildMailboxKey(mailbox: Mailbox): string {
  return mailbox.kind === 'mail' ? 'mail' : `${mailbox.source}:${mailbox.connectionID}`;
}
