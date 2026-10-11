import type { SeedResult } from '@heynixie/definitions';
import { runSeed } from '@heynixie/definitions';
import type { ServerParts } from './types';

// Runs one seed. The definitions part turns unready while a refused snapshot is pending, and the
// last good seed stays in force.
export async function runDefinitionsSeed(parts: ServerParts): Promise<SeedResult> {
  const result = await runSeed({
    log: parts.context.log,
    source: parts.source,
    policy: parts.policy,
  });

  parts.inForce.current = result.inForce ?? parts.inForce.current;
  parts.state.definitions =
    result.status === 'refused'
      ? { isReady: false, reason: `the last snapshot was refused: ${result.error.name}` }
      : { isReady: true, reason: null };
  parts.log('definitions.seeded', {
    status: result.status,
    snapshotHash: result.inForce?.snapshotHash ?? null,
    ...(result.status === 'refused' ? { error: result.error.name } : {}),
  });
  return result;
}
