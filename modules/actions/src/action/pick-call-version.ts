import type { ActionAttempt } from '@heynixie/connectors';
import type { ActionRow } from '../types';
import type { QueuedCall } from './leased-records';

interface VersionedAttempt {
  readonly action: Pick<ActionRow, 'is_approved'>;
  readonly attempt: number;
}

// The version of the tool that an attempt carries to the connector. The first attempt of an
// approved action carries none: an approval, including the one that answers a question about a
// changed tool, covers the tool as it stands when the attempt starts.
export function pickCallVersion(
  attempt: VersionedAttempt,
  queued: Pick<QueuedCall, 'pinHash' | 'definitionsHash'>,
): Pick<ActionAttempt, 'pinHash' | 'definitionsHash'> {
  if (attempt.action.is_approved === 1 && attempt.attempt === 1) {
    return {};
  }

  return {
    ...(queued.pinHash === undefined ? {} : { pinHash: queued.pinHash }),
    ...(queued.definitionsHash === undefined ? {} : { definitionsHash: queued.definitionsHash }),
  };
}
