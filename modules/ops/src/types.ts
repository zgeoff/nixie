import type { logLevels } from './log-levels';

// One part's answer to a health check. reason says why the part is not ready, and is null when it
// is.
export interface PartReport {
  readonly isReady: boolean;
  readonly reason: string | null;
}

// A check of one part, which the health endpoint runs on each request.
export type PartCheck = () => Promise<PartReport>;

// The answer of a liveness or a readiness request: ready only when every part is ready.
export interface HealthReport {
  readonly status: 'ready' | 'unready';
  readonly parts: Readonly<Record<string, PartReport>>;
}

// A JSON log line's fields beside its event: envelope values only, such as IDs, kinds, counts and
// outcomes, never message text, tool arguments or results.
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

// How much an event matters, from least to most: a threshold below an event's level writes it.
export type LogLevel = (typeof logLevels)[number];

// Writes one JSON line to the log, at info unless the call names another level.
export type Logger = (event: string, fields?: LogFields, level?: LogLevel) => void;
