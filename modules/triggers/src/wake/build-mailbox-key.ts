import type { Mailbox } from '../types';

// The one text form that tables store for a mailbox: `mail`, or `gmail:` and the connection's ID.
export function buildMailboxKey(mailbox: Mailbox): string {
  return mailbox.kind === 'mail' ? 'mail' : `gmail:${mailbox.connectionID}`;
}
