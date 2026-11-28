// The statuses that tell the model about a connection. `disconnected` is the owner's own choice, and
// no connection holds it yet.
export type AttentionStatus = 'needs_consent' | 'disconnected' | 'failing' | 'expiring';

export type FailingReason = 'unauthorised' | 'service_error' | 'no_answer';

// Who a line of the status names. The label and the account sit sealed under the connection's key
// and are read when a line renders, never stored in a record.
export interface ConnectionIdentity {
  // the short ID
  readonly connection: string;
  readonly connector: string;
  readonly label: string;
  readonly account: string;
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
    })
  | (StatusEventFacts & { readonly kind: 'returned'; readonly failedCalls: number })
  | (StatusEventFacts & { readonly kind: 'lasted'; readonly sinceMs: number });
