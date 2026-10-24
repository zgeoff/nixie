import type { SeedResult } from '@heynixie/definitions';
import { runSeed } from '@heynixie/definitions';
import type { SeedParts } from './run-queued-seed';
import { runQueuedSeed } from './run-queued-seed';

export function runDefinitionsSeed(parts: SeedParts): Promise<SeedResult> {
  return runQueuedSeed(parts, async () => {
    const result = await runSeed({
      log: parts.context.log,
      source: parts.source,
      buildPolicy: parts.buildPolicy,
    });

    parts.state.update({
      definitions:
        result.status === 'refused'
          ? { isReady: false, reason: `the last snapshot was refused: ${result.error.name}` }
          : { isReady: true, reason: null },
    });

    return result;
  });
}
