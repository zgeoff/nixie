import type { Mailbox } from '../types';

const gmailPrefix = 'gmail:';

// The mailbox that a stored key names, the inverse of buildMailboxKey.
export function parseMailboxKey(key: string): Mailbox {
  if (key.startsWith(gmailPrefix)) {
    return { kind: 'gmail', connectionID: key.slice(gmailPrefix.length) };
  }

  return { kind: 'mail' };
}
