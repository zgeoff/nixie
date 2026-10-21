import { waitForSettled } from '@heynixie/async';
import type { SeedResult } from '@heynixie/definitions';
import { buildSeedLogFields } from './build-seed-log-fields';
import type { ServerParts } from './types';

export type SeedParts = Pick<
  ServerParts,
  'context' | 'source' | 'policy' | 'inForce' | 'state' | 'log'
>;

const pendingSeeds = new WeakMap<SeedParts, Promise<void>>();

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
