// One part's answer to a health check. reason says why the part is not ready, and is null when it
// is.
export interface PartReport {
  readonly isReady: boolean;
  readonly reason: string | null;
}

// A check of one part, which the health endpoint runs on each request. The signal aborts once the
// check outlasts its timeout, so a check that calls another service ends that call.
export type PartCheck = (signal?: AbortSignal) => Promise<PartReport>;

// The answer of a liveness or a readiness request: ready only when every part is ready. A readiness
// answer adds the advisory parts, which never change its status.
export interface HealthReport {
  readonly status: 'ready' | 'unready';
  readonly parts: Readonly<Record<string, PartReport>>;
  readonly advisory?: Readonly<Record<string, PartReport>>;
}
