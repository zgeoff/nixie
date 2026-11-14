import type { SeedResult } from '@heynixie/definitions';
import type { LogFields } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';

export function buildSeedLogFields(result: SeedResult): LogFields {
  return {
    status: result.status,
    inForceRevision: result.inForce?.revision ?? null,
    inForceContentHash: result.inForce?.contentHash ?? null,
    inForceSnapshotHash: result.inForce?.snapshotHash ?? null,
    ...(result.status === 'refused' ? toErrorFields(result.error) : {}),
  };
}
