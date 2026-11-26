// The times from which a connection's mail must be read again. A reply rule that starts after the
// mail it answers went out asks for one, because a reply that arrived before the rule existed was
// dropped, and its poll has moved on.
export interface GmailRewinds {
  // asks the poll of the connection to read the mail that arrived since this time (epoch ms)
  readonly request: (connectionID: string, sinceMs: number) => void;

  // the earliest time that any request names, or null when none stands
  readonly read: (connectionID: string) => number | null;

  // drops the requests that a poll read, once its delivery committed, and keeps any earlier one that
  // came in after the read
  readonly clear: (connectionID: string, readMs: number) => void;
}

export function createGmailRewinds(): GmailRewinds {
  const sinceByConnection = new Map<string, number>();

  return {
    request: (connectionID, sinceMs) => {
      sinceByConnection.set(
        connectionID,
        Math.min(sinceMs, sinceByConnection.get(connectionID) ?? sinceMs),
      );
    },
    read: (connectionID) => sinceByConnection.get(connectionID) ?? null,
    clear: (connectionID, readMs) => {
      if (sinceByConnection.get(connectionID) === readMs) {
        sinceByConnection.delete(connectionID);
      }
    },
  };
}
