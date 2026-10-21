import type { SkillExportSweep } from '@heynixie/definitions';
import type { SeedParts } from './run-queued-seed';
import { runWrittenSkillsSeed } from './run-written-skills-seed';

export async function runApprovedSkillsSeed(
  parts: SeedParts | null,
  exports: SkillExportSweep | null,
): Promise<void> {
  if (parts !== null) {
    await runWrittenSkillsSeed(parts);
  }

  exports?.wake();
}
