// The statuses that tell the model about a connection. `disconnected` is the owner's own choice: the
// binding of the connection is disabled.
export type AttentionStatus = 'needs_consent' | 'disconnected' | 'failing' | 'expiring';

export type FailingReason = 'unauthorised' | 'service_error' | 'no_answer';

// Who a line of the status names. The label and the account sit sealed under the connection's key
// and are read when a line renders, never stored in a record.
export interface ConnectionIdentity {
  // the short ID
  readonly connection: string;
  readonly connector: string;
  readonly label: string;

  // empty when the connection's account holds no address
  readonly account: string;
}

// What a line about a connection reads from the connection as it stands when the line is built.
export interface ConnectionFacts extends ConnectionIdentity {
  readonly lastSuccessAtMs: number | null;

  // the tools that the scopes the connection was granted cover, by name
  readonly toolNames: readonly string[];
}

// A connection that is not `active` or `forgotten`, as the status entry lists it.
export interface AttentionConnection extends ConnectionIdentity {
  readonly status: AttentionStatus;
  readonly reason: FailingReason | null;

  // when the status began
  readonly sinceMs: number;
  readonly lastSuccessAtMs: number | null;

  // the tools that calls through the connection can no longer reach, by name
  readonly removedTools: readonly string[];
}

export interface StatusEventRange {
  // the sequence the range starts after, and the last sequence it holds
  readonly after: number;
  readonly through: number;
}

interface StatusEventFacts {
  readonly sequence: number;
  readonly atMs: number;
  readonly who: ConnectionIdentity;
}

// One line of the events block about a connection.
export type StatusEvent =
  | (StatusEventFacts & {
      readonly kind: 'changed';
      readonly status: AttentionStatus;
      readonly reason: FailingReason | null;
      readonly lastSuccessAtMs: number | null;

      // the tools that calls through the connection can no longer reach, by name
      readonly removedTools: readonly string[];
    })
  | (StatusEventFacts & {
      readonly kind: 'returned';

      // the tool calls that failed during the break, one for each call
      readonly failedCalls: number;

      // the job runs that started during the break with the connection pinned
      readonly skippedRuns: number;
    })
  | (StatusEventFacts & { readonly kind: 'lasted'; readonly sinceMs: number });
