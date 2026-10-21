import type { SkillExportState } from './types';

const transitions: Readonly<Record<SkillExportState, readonly SkillExportState[]>> = {
  exporting: ['exporting', 'opened', 'closed'],
  opened: ['exporting', 'closed'],
  closed: [],
};

export function canMoveSkillExport(from: SkillExportState, to: SkillExportState): boolean {
  return transitions[from].includes(to);
}
