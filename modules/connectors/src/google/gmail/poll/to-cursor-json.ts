import type { JSONValue } from '@heynixie/log';
import type { GmailSourceCursor } from './gmail-source-cursor';

export function toCursorJSON(cursor: GmailSourceCursor): JSONValue {
  return Object.fromEntries(
    Object.entries(cursor).map(([id, entry]) => [
      id,
      { historyID: entry.historyID, polledAt: entry.polledAt },
    ]),
  );
}
