import type { SeedResult } from '@heynixie/definitions';
import { runWrittenSkillSeed } from '@heynixie/definitions';
import type { SeedParts } from './run-queued-seed';
import { runQueuedSeed } from './run-queued-seed';

// Seeds the definitions in force again with the skills nixie wrote as they stand, after an
// approval, in the seed queue. It reads no snapshot from the source, so it leaves the definitions
// part's readiness as it was.
export function runWrittenSkillsSeed(parts: SeedParts): Promise<SeedResult> {
  return runQueuedSeed(parts, () =>
    runWrittenSkillSeed({ log: parts.context.log, policy: parts.policy }),
  );
}
