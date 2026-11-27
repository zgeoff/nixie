import type { Mailbox } from '../types';

// The one text form that tables store for a mailbox: `mail`, the source, a colon and the
// connection's ID, or `source:` and the text source's ID.
export function buildMailboxKey(mailbox: Mailbox): string {
  if (mailbox.kind === 'source') {
    return `source:${mailbox.sourceID}`;
  }

  return mailbox.kind === 'mail' ? 'mail' : `${mailbox.source}:${mailbox.connectionID}`;
}
