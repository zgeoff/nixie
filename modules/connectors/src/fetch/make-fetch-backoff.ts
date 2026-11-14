import type { Clock } from '@heynixie/clock';

export interface FetchBackoffOptions {
  readonly backoffMs: number;
  readonly backoffCapMs: number;
  readonly clock: Clock;
}

export interface FetchBackoff {
  // the milliseconds left, 0 when the host has none
  readonly readPause: (host: string) => number;

  // the pause is retryAfterMs, or backoffMs when null, at most backoffCapMs; 0 sets none
  readonly setPause: (host: string, retryAfterMs: number | null) => void;

  readonly clear: () => void;
}

// The pauses live in the memory of the server process, so a restart drops them.
export function makeFetchBackoff(options: FetchBackoffOptions): FetchBackoff {
  const endsAt = new Map<string, number>();

  return {
    readPause: (host) => {
      const end = endsAt.get(host);

      if (end === undefined) {
        return 0;
      }

      const leftMs = end - options.clock.now();

      if (leftMs <= 0) {
        endsAt.delete(host);

        return 0;
      }

      return leftMs;
    },
    setPause: (host, retryAfterMs) => {
      if (retryAfterMs === 0) {
        return;
      }

      const pauseMs = Math.min(retryAfterMs ?? options.backoffMs, options.backoffCapMs);
      const end = options.clock.now() + pauseMs;

      endsAt.set(host, Math.max(end, endsAt.get(host) ?? end));
    },
    clear: () => {
      endsAt.clear();
    },
  };
}
