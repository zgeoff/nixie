import { waitForSettled } from '@heynixie/async';
import type { SeedResult } from '@heynixie/definitions';
import { buildSeedLogFields } from './build-seed-log-fields';
import type { ServerParts } from './types';

// the server parts a seed reads and updates
export type SeedParts = Pick<
  ServerParts,
  'context' | 'source' | 'policy' | 'inForce' | 'state' | 'log'
>;

// the newest seed each set of parts started, which the next one waits for
const pendingSeeds = new WeakMap<SeedParts, Promise<void>>();

// Runs one seed after every seed queued before it over the same parts, as the seed needs, so the
// poll, a skill reload and an approval never commit an older revision after a newer one. A seed
// that fails gives its failure to its caller, and the next seed still runs.
export function runQueuedSeed(
  parts: SeedParts,
  seed: () => Promise<SeedResult>,
): Promise<SeedResult> {
  const queued = waitThenSeed(pendingSeeds.get(parts), parts, seed);

  pendingSeeds.set(parts, waitForSettled(queued));

  return queued;
}

async function waitThenSeed(
  previous: Promise<void> | undefined,
  parts: SeedParts,
  seed: () => Promise<SeedResult>,
): Promise<SeedResult> {
  await previous;

  const result = await seed();

  if (result.inForce !== null) {
    parts.inForce.set(result.inForce);
  }

  parts.log('definitions.seeded', buildSeedLogFields(result));

  return result;
}
