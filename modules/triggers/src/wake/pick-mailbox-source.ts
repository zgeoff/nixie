import type { Mailbox } from '../types';

// The ID of the mail source that reads the mailbox.
export function pickMailboxSource(mailbox: Mailbox): string {
  return mailbox.kind === 'mail' ? 'mail' : mailbox.source;
}
