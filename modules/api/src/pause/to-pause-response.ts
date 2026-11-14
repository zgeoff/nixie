import type { PauseState } from './to-pause-state';

export function toPauseResponse(paused: PauseState | null) {
  return paused === null ? null : { cause: paused.cause, since: new Date(paused.since) };
}
