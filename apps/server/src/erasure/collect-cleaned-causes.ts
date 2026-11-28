import type { ErasureSessionCause } from '@heynixie/log';
import type { SessionCleanupCause } from '@heynixie/sessions';

// The causes whose sessions an erasure cleans. A record forget cleans the session of each start
// call that holds a removed brief, and the reset's thread cause has no session left to clean.
export function collectCleanedCauses(cause: ErasureSessionCause): readonly SessionCleanupCause[] {
  if ('thread' in cause) {
    return [];
  }

  if ('recordSequence' in cause) {
    return [...(cause.callSequences ?? []), cause.recordSequence].map((recordSequence) => ({
      recordSequence,
    }));
  }

  return [cause];
}
