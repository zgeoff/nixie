import { waitForSettled } from '@heynixie/async';
import type { SeedResult } from '@heynixie/definitions';
import type { ServerParts } from '../types';
import { recordSeedResult } from './record-seed-result';

export type SeedParts = Pick<
  ServerParts,
  'context' | 'source' | 'buildPolicy' | 'tasks' | 'inForce' | 'state' | 'log'
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

  recordSeedResult(parts, result);

  return result;
}
