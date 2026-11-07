import type { SeedResult } from '@heynixie/definitions';
import { runInForceSeed } from '@heynixie/definitions';
import type { SeedParts } from './run-queued-seed';
import { runQueuedSeed } from './run-queued-seed';

export function runWrittenSkillsSeed(parts: SeedParts): Promise<SeedResult> {
  return runQueuedSeed(parts, () =>
    runInForceSeed({ log: parts.context.log, buildPolicy: parts.buildPolicy }),
  );
}
