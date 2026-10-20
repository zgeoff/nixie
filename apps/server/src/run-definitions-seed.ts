import { waitForSettled } from '@heynixie/async';
import type { SeedResult } from '@heynixie/definitions';
import { runSeed } from '@heynixie/definitions';
import { buildSeedLogFields } from './build-seed-log-fields';
import type { ServerParts } from './types';

// the server parts a seed reads and updates
export type SeedParts = Pick<
  ServerParts,
  'context' | 'source' | 'policy' | 'inForce' | 'state' | 'log'
>;

// the newest seed each set of parts started, which the next one waits for
const pendingSeeds = new WeakMap<SeedParts, Promise<void>>();

// Runs one seed. The definitions part turns unready while a refused snapshot is pending, and the
// last good seed stays in force. Seeds over one set of parts run one at a time, as the seed needs,
// so the poll and a skill reload never commit an older revision after a newer one.
export function runDefinitionsSeed(parts: SeedParts): Promise<SeedResult> {
  const seed = waitThenSeed(pendingSeeds.get(parts), parts);

  pendingSeeds.set(parts, waitForSettled(seed));

  return seed;
}

async function waitThenSeed(
  previous: Promise<void> | undefined,
  parts: SeedParts,
): Promise<SeedResult> {
  await previous;

  return runOneSeed(parts);
}

async function runOneSeed(parts: SeedParts): Promise<SeedResult> {
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
