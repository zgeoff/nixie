import type { Mailbox } from '../types';

const sourcePrefix = 'source:';

// The mailbox that a stored key names, the inverse of buildMailboxKey. A text source's key comes
// first, because no connection's source takes the name `source`.
export function parseMailboxKey(key: string): Mailbox {
  if (key.startsWith(sourcePrefix)) {
    return { kind: 'source', sourceID: key.slice(sourcePrefix.length) };
  }

  const separator = key.indexOf(':');

  if (separator === -1) {
    return { kind: 'mail' };
  }

  return {
    kind: 'connection',
    source: key.slice(0, separator),
    connectionID: key.slice(separator + 1),
  };
}
