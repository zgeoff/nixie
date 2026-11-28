import type { ErasureSessionCause } from '@heynixie/log';
import type { SessionCleanupCause } from '@heynixie/sessions';

// The causes whose sessions an erasure cleans. A record forget cleans the session of each start
// call that holds a removed brief, and a cause with no sessions has none to clean.
export function collectCleanedCauses(cause: ErasureSessionCause): readonly SessionCleanupCause[] {
  if ('sessions' in cause) {
    return [];
  }

  if ('recordSequence' in cause) {
    return [...(cause.callSequences ?? []), cause.recordSequence].map((recordSequence) => ({
      recordSequence,
    }));
  }

  return [cause];
}
