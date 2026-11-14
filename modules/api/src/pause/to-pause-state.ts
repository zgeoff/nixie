import type { PauseCause, PauseSince } from '@heynixie/log';

export interface PauseState {
  readonly cause: PauseCause;
  readonly since: number;
}

export function toPauseState(pause: PauseSince | null): PauseState | null {
  return pause === null ? null : { cause: pause.cause, since: pause.since };
}
