import { match } from 'ts-pattern';
import type { CallSnapshot } from './types';

// The connection state in words, for the call screen and the call bar.
export function formatCallStatus(snapshot: Pick<CallSnapshot, 'phase' | 'connection'>): string {
  return match(snapshot)
    .with({ phase: 'idle' }, () => 'No call')
    .with({ phase: 'asking' }, () => 'Waiting for the microphone')
    .with({ phase: 'starting' }, () => 'Starting the call')
    .with({ phase: 'connecting' }, () => 'Connecting')
    .with({ phase: 'reconnecting' }, () => 'Reconnecting')
    .with({ phase: 'ended' }, () => 'Call ended')
    .with({ phase: 'refused' }, () => 'The call did not start')
    .with({ phase: 'live', connection: 'disconnected' }, () => 'Connection unstable')
    .with({ phase: 'live', connection: 'failed' }, () => 'Connection lost')
    .with({ phase: 'live' }, () => 'Connected')
    .exhaustive();
}
