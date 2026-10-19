import type { HealthStatus } from './health-statuses';

// One part's answer to a health check. reason says why the part is not ready, and is null when it
// is.
export interface PartReport {
  readonly isReady: boolean;
  readonly reason: string | null;
}

// A check of one part, which the health endpoint runs on each request. The signal aborts once the
// check outlasts its timeout, so a check that calls another service ends that call.
export type PartCheck = (signal?: AbortSignal) => Promise<PartReport>;

// The answer of a liveness or a readiness request: unready when a part is unready. A readiness
// answer adds the dependency parts, which make a ready status degraded when one fails, and the
// advisory parts, which never change the status.
export interface HealthReport {
  readonly status: HealthStatus;
  readonly parts: Readonly<Record<string, PartReport>>;
  readonly dependencies?: Readonly<Record<string, PartReport>>;
  readonly advisory?: Readonly<Record<string, PartReport>>;
}
