import type { SessionState } from '@heynixie/coding';
import { P, match } from 'ts-pattern';

// atc's session state as the coding module's, or null for a value this release does not know.
export function mapATCState(state: string, harness: string | undefined): SessionState | null {
  return match({ state, harness })
    .returnType<SessionState | null>()
    .with({ state: 'running' }, () => 'running')
    .with({ state: 'needs_you' }, () => 'waiting')
    .with({ state: 'done' }, () => 'idle')
    .with({ state: 'exited', harness: 'suspended' }, () => 'gone')
    .with({ state: 'exited', harness: P.any }, () => 'ended')
    .otherwise(() => null);
}
