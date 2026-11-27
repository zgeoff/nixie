import type { ConnectorContext } from '@heynixie/connections';
import type { GoogleHosts } from '../../connector/google-hosts';
import type { GmailSourceCursor } from './gmail-source-cursor';
import { readGmailAddedIDs } from './read-gmail-added-ids';
import { readGmailProfileHistoryID } from './read-gmail-profile-history-id';
import { readGmailRecentIDs } from './read-gmail-recent-ids';

export interface GmailChanges {
  readonly ids: readonly string[];

  // the history ID the cursor takes once the changes are delivered
  readonly historyID: string;
}

export interface GmailChangesRequest {
  readonly entry: GmailSourceCursor[string];

  // when a reply rule asked to read the mail since a time again, epoch ms; null when none did
  readonly rewindMs: number | null;
}

const lookbackMs = 10 * 60_000;

// The messages added since a connection's last good poll, or the recent mail when Gmail no longer
// keeps that history or a reply rule asked for an earlier read. A resync reads the profile's history
// ID before it lists, so a mail that arrives between the two is in the list or after the cursor.
export async function readGmailChanges(
  hosts: GoogleHosts,
  context: ConnectorContext,
  request: GmailChangesRequest,
): Promise<GmailChanges> {
  if (request.rewindMs === null) {
    const added = await readGmailAddedIDs(hosts, context, request.entry.historyID);

    if (added.kind === 'added') {
      return { ids: added.ids, historyID: added.historyID };
    }
  }

  const historyID = await readGmailProfileHistoryID(hosts, context);

  const sinceMs = Math.min(
    request.entry.polledAt - lookbackMs,
    request.rewindMs ?? Number.POSITIVE_INFINITY,
  );

  const ids = await readGmailRecentIDs(hosts, context, sinceMs);

  return { ids, historyID };
}
