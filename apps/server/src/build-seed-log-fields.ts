import type { SeedResult } from '@heynixie/definitions';
import type { LogFields } from '@heynixie/ops';

// The fields of a definitions.seeded line, each naming the definitions in force after the seed, so
// a refused seed shows the last good one. The revision and the content hash follow every file; the
// snapshot hash follows only what is in force.
export function buildSeedLogFields(result: SeedResult): LogFields {
  return {
    status: result.status,
    inForceRevision: result.inForce?.revision ?? null,
    inForceContentHash: result.inForce?.contentHash ?? null,
    inForceSnapshotHash: result.inForce?.snapshotHash ?? null,
    ...(result.status === 'refused' ? { error: result.error.name } : {}),
  };
}
