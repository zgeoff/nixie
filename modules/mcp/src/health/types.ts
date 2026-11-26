// Why a server listing failed, in the words of a record and an error to the model.
export type ListingFailureCause = 'refused' | 'error' | 'unparsable' | 'timeout' | 'unauthorised';

// What the proxy knows of one server's listings, in memory and shared by every task run.
export interface ServerHealth {
  // failed server listings in a row
  readonly failures: number;

  // when the next try is due; null when no listing has failed since the last pass
  readonly nextTryAtMs: number | null;
  readonly lastError: ListingFailureCause | null;

  // whether the newest server listing passed; false until the first one since the start
  readonly hasPassed: boolean;

  readonly isUnhealthy: boolean;
}

export const initialHealth: ServerHealth = {
  failures: 0,
  nextTryAtMs: null,
  lastError: null,
  hasPassed: false,
  isUnhealthy: false,
};

// Failed listings back off from 1 minute to 1 hour, and the server is unhealthy after 3 in a row.
export const healthDefaults = {
  firstTryMs: 60_000,
  maxTryMs: 3_600_000,
  unhealthyAfter: 3,
} as const;
