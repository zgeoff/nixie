import { buildSkillChangeKind } from './build-skill-change-kind';
import type {
  DefinitionsExportSweep,
  DefinitionsExportSweepOptions,
} from './start-definitions-export-sweep';
import { startDefinitionsExportSweep } from './start-definitions-export-sweep';
import type { SkillExportText } from './types';

export interface SkillExportSweepOptions extends Omit<DefinitionsExportSweepOptions, 'kinds'> {
  readonly text: SkillExportText;
}

export type SkillExportSweep = DefinitionsExportSweep;

export function startSkillExportSweep(options: SkillExportSweepOptions): SkillExportSweep {
  const { text, ...sweepOptions } = options;

  return startDefinitionsExportSweep({ ...sweepOptions, kinds: [buildSkillChangeKind(text)] });
}
