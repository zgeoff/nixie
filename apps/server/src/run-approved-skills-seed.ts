import type { DefinitionsExportSweep } from '@heynixie/definitions';
import type { SeedParts } from './run-queued-seed';
import { runWrittenSkillsSeed } from './run-written-skills-seed';

export async function runApprovedSkillsSeed(
  parts: SeedParts | null,
  exports: DefinitionsExportSweep | null,
): Promise<void> {
  if (parts !== null) {
    await runWrittenSkillsSeed(parts);
  }

  exports?.wake();
}
