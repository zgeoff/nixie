import type { SeedResult } from '@heynixie/definitions';
import { buildPromptSafetyLogFields } from '../prompt/build-prompt-safety-log-fields';
import { buildSeedLogFields } from './build-seed-log-fields';
import type { SeedParts } from './run-queued-seed';

const checkedSnapshots = new WeakMap<SeedParts, string>();

// Takes the result of a seed into the server's state: the definitions in force, and the events
// that say what the seed did.
export function recordSeedResult(parts: SeedParts, result: SeedResult): void {
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
}
