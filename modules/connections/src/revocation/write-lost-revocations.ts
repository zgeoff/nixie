import { readOpenErasures } from '@heynixie/log';
import { readRecordedRevocations } from './read-recorded-revocations';
import type { RevocationWriter } from './write-revocation-recorded';
import { writeRevocationRecorded } from './write-revocation-recorded';

// At start, before the runner's catch-up: each forget that began and has no revocation outcome may
// have sent its request before the crash, so it records `unknown`. The catch-up then never sends a
// second one.
export async function writeLostRevocations(writer: RevocationWriter): Promise<number> {
  const open = await readOpenErasures(writer.log);
  const recorded = await readRecordedRevocations(writer.log);

  const lost = open
    .filter((erasure) => erasure.started.kind === 'credential')
    .map((erasure) => erasure.started.targetID)
    .filter((connectionID) => !recorded.has(connectionID));

  for (const connectionID of lost) {
    await writeRevocationRecorded(writer, connectionID, {
      outcome: 'unknown',
      status: null,
      providerError: null,
    });
  }

  return lost.length;
}
