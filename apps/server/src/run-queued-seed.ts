import { waitForSettled } from '@heynixie/async';
import type { SeedResult } from '@heynixie/definitions';
import { buildPromptSafetyLogFields } from './build-prompt-safety-log-fields';
import { buildSeedLogFields } from './build-seed-log-fields';
import type { ServerParts } from './types';

export type SeedParts = Pick<
  ServerParts,
  'context' | 'source' | 'buildPolicy' | 'inForce' | 'state' | 'log'
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

const checkedSnapshots = new WeakMap<SeedParts, string>();

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

  if (result.inForce !== null && checkedSnapshots.get(parts) !== result.inForce.snapshotHash) {
    checkedSnapshots.set(parts, result.inForce.snapshotHash);

    const fields = buildPromptSafetyLogFields(result.inForce.prompts);

    if (fields !== null) {
      parts.log('prompts.safety_missing', fields);
    }
  }

  return result;
}
