import type { SkillExportSweep } from '@heynixie/definitions';
import type { SeedParts } from './run-queued-seed';
import { runWrittenSkillsSeed } from './run-written-skills-seed';

// Puts the skills nixie wrote in force after an approval or a choice on a conflict, then wakes
// their export to the definitions repo. Before the server's parts start, no seed runs, and the seed
// at start lays the approved skill over the definitions.
export async function runApprovedSkillsSeed(
  parts: SeedParts | null,
  exports: SkillExportSweep | null,
): Promise<void> {
  if (parts !== null) {
    await runWrittenSkillsSeed(parts);
  }

  exports?.wake();
}
