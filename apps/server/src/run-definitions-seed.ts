import type { SeedResult } from '@heynixie/definitions';
import { runSeed } from '@heynixie/definitions';
import { buildSeedLogFields } from './build-seed-log-fields';
import type { ServerParts } from './types';

// Runs one seed. The definitions part turns unready while a refused snapshot is pending, and the
// last good seed stays in force.
export async function runDefinitionsSeed(parts: ServerParts): Promise<SeedResult> {
  const result = await runSeed({
    log: parts.context.log,
    source: parts.source,
    policy: parts.policy,
  });

  if (result.inForce !== null) {
    parts.inForce.set(result.inForce);
  }

  parts.state.update({
    definitions:
      result.status === 'refused'
        ? { isReady: false, reason: `the last snapshot was refused: ${result.error.name}` }
        : { isReady: true, reason: null },
  });

  parts.log('definitions.seeded', buildSeedLogFields(result));

  return result;
}
