import { buildSkillChangeKind } from './build-skill-change-kind';
import type { DefinitionsExportOptions, DefinitionsExportResult } from './run-definitions-exports';
import { runDefinitionsExports } from './run-definitions-exports';
import type { SkillExportText } from './types';

export interface SkillExportOptions extends Omit<DefinitionsExportOptions, 'kinds'> {
  readonly text?: SkillExportText;
}

export type SkillExportResult = DefinitionsExportResult;

export function runSkillExports(options: SkillExportOptions): Promise<SkillExportResult> {
  const {
    text = { title: null, message: null, agentName: null, ownerName: null },
    ...exportOptions
  } = options;

  return runDefinitionsExports({ ...exportOptions, kinds: [buildSkillChangeKind(text)] });
}
