import { resolveProgram } from '@zgeoff/rig/e2e';
import invariant from 'tiny-invariant';
import type { SpawnedNixie, SpawnedNixieOptions } from './start-spawned-nixie';
import { startSpawnedNixie } from './start-spawned-nixie';

// Starts nixie from the `nixie` program in rig.config.ts, as an `e2e/` suite does. A suite that runs
// outside the e2e lane starts the test bundle through `startSpawnedNixie` instead.
export async function startE2ENixie(options: SpawnedNixieOptions = {}): Promise<SpawnedNixie> {
  const program = await resolveProgram('nixie');

  const entry = program.command.at(-1);

  invariant(entry !== undefined, 'the nixie program has no entry file');

  return startSpawnedNixie({ ...options, entry });
}
