import { match } from 'ts-pattern';
import type { Mailbox } from '../types';

// The ID of the source that reads the mailbox.
export function pickMailboxSource(mailbox: Mailbox): string {
  return match(mailbox)
    .with({ kind: 'mail' }, () => 'mail')
    .with({ kind: 'connection' }, (connection) => connection.source)
    .with({ kind: 'source' }, (text) => text.sourceID)
    .exhaustive();
}
