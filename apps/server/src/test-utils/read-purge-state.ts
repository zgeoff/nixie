import { systemClock } from '@heynixie/clock';
import type { KeyStoreTables } from '@heynixie/log';
import type { PurgeRow } from '@heynixie/memory/test-utils';
import { readPurgeRows } from '@heynixie/memory/test-utils';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

export interface PurgeState {
  readonly purges: readonly PurgeRow[];

  // every key ID in the key store
  readonly keyIDs: readonly string[];
}

// Reads the data of a nixie that has stopped.
export async function readPurgeState(
  files: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
): Promise<PurgeState> {
  const data = await startDataLog({
    dataDir: files.dataDir,
    deploymentKey: files.deploymentKey,
    clock: systemClock,
  });

  try {
    const purges = await readPurgeRows(data.writer.db);

    const keys = await data.writer.keys
      .$extendTables<KeyStoreTables>()
      .selectFrom('record_keys')
      .select('key_id')
      .execute();

    return { purges, keyIDs: keys.map((key) => key.key_id) };
  } finally {
    await data.writer.stop();
  }
}
