import { gmailScope } from '../gmail-tool-names';
import type { GmailConnection } from './types';

export interface GoogleConnectionState extends GmailConnection {
  readonly scopes: readonly string[];
}

// The connections that hold Gmail access, which is the scope the Gmail tools already need. The poll
// and the wake tools read the same list, so a rule is never set where no poll would read.
export function collectGmailConnections(
  states: readonly GoogleConnectionState[],
): readonly GmailConnection[] {
  return states
    .filter((state) => state.scopes.includes(gmailScope))
    .map((state) => ({
      connectionID: state.connectionID,
      connection: state.connection,
      status: state.status,
    }));
}
