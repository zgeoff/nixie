import { systemClock } from '@heynixie/clock';
import type { SharedProposal } from '@heynixie/proposals';
import { readProposal } from '@heynixie/proposals';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

// Reads one proposal's shared row from the data of a nixie that has stopped.
export async function readStoppedProposal(
  files: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
  proposalID: string,
): Promise<SharedProposal | null> {
  const data = await startDataLog({
    dataDir: files.dataDir,
    deploymentKey: files.deploymentKey,
    clock: systemClock,
  });

  try {
    return await readProposal(data.writer.db, proposalID);
  } finally {
    await data.writer.stop();
  }
}
