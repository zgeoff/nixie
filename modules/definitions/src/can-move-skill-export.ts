import type { SkillExportState } from './types';

const transitions: Readonly<Record<SkillExportState, readonly SkillExportState[]>> = {
  exporting: ['exporting', 'opened', 'closed'],
  opened: ['exporting', 'closed'],
  closed: [],
};

// Whether the export of a skill that nixie wrote may move from one state to another. An export
// records itself before it writes to your definitions repo, so a run that stopped midway leaves it
// in flight, and the next run exports it again or closes it.
export function canMoveSkillExport(from: SkillExportState, to: SkillExportState): boolean {
  return transitions[from].includes(to);
}
