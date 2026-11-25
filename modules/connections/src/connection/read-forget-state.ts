import { readErasureFinishedSequence } from '@heynixie/log';
import type { Log } from '@heynixie/log';
import type { RecordedOutcome } from '../revocation/read-revocation-outcomes';
import type { ForgetState } from '../types';

// Where a connection's forget stands: whether the runner finished it, and how its one revocation
// ended. The revocation is pending until its outcome is recorded.
export async function readForgetState(
  log: Pick<Log, 'writer'>,
  connectionID: string,
  outcomes: ReadonlyMap<string, RecordedOutcome>,
): Promise<ForgetState> {
  const finished = await readErasureFinishedSequence(log, 'credential', connectionID);

  return {
    erasure: finished === null ? 'pending' : 'done',
    finishedSequence: finished,
    revocation: outcomes.get(connectionID) ?? 'pending',
  };
}
