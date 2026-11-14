import type { DefinitionsExportSweep } from '@heynixie/definitions';
import { runQueuedInForceSeed } from './run-queued-in-force-seed';
import type { SeedParts } from './run-queued-seed';

export async function runInForceSeedAndWake(
  parts: SeedParts | null,
  exports: DefinitionsExportSweep | null,
): Promise<void> {
  if (parts !== null) {
    await runQueuedInForceSeed(parts);
  }

  exports?.wake();
}
