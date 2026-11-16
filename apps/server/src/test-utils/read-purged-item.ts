import { systemClock } from '@heynixie/clock';
import type { StartedMemoryStore } from '@heynixie/memory';
import { startDataLog } from './start-data-log';
import { startSeedMemory } from './start-seed-memory';
import type { BootFiles } from './write-boot-files';

interface PurgedVersion {
  readonly version: number;
  readonly status: 'readable' | 'shredded' | 'unreadable';
  readonly isRemoved: boolean;
  readonly isBridge: boolean;
}

export interface PurgedItem {
  readonly versions: readonly PurgedVersion[];
  readonly labels: Awaited<ReturnType<StartedMemoryStore['writes']['readItemLabels']>>;
}

// Reads one item's history and labels from the data of a nixie that has stopped.
export async function readPurgedItem(
  files: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
  itemID: string,
): Promise<PurgedItem> {
  const data = await startDataLog({
    dataDir: files.dataDir,
    deploymentKey: files.deploymentKey,
    clock: systemClock,
  });

  try {
    const memory = await startSeedMemory(data.context);

    try {
      const history = await memory.readHistory(itemID);
      const labels = await memory.writes.readItemLabels(itemID);

      return {
        versions: (history?.versions ?? []).map((version) => ({
          version: version.version,
          status: version.status,
          isRemoved: version.isRemoved,
          isBridge: version.isBridge,
        })),
        labels,
      };
    } finally {
      await memory.stop();
    }
  } finally {
    await data.writer.stop();
  }
}
