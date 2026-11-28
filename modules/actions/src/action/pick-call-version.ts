import type { ActionAttempt } from '@heynixie/connectors';
import type { QueuedCall } from './leased-records';

// The version of the tool that every attempt carries to the connector: the one that the call was
// decided on, or that the owner's last answer about it covered. A connector refuses an attempt once
// its tool has moved from that version.
export function pickCallVersion(
  queued: Pick<QueuedCall, 'pinHash' | 'definitionsHash'>,
): Pick<ActionAttempt, 'pinHash' | 'definitionsHash'> {
  return {
    ...(queued.pinHash === undefined ? {} : { pinHash: queued.pinHash }),
    ...(queued.definitionsHash === undefined ? {} : { definitionsHash: queued.definitionsHash }),
  };
}
