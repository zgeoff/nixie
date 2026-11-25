import type { Mailbox } from '../types';

// The one text form that tables store for a mailbox, and the ID of its source.
export function buildMailboxKey(mailbox: Mailbox): string {
  return mailbox.kind;
}
