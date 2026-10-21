import type { SkillExportState } from './types';

const transitions: Readonly<Record<SkillExportState, readonly SkillExportState[]>> = {
  opened: ['opened', 'closed'],
  closed: [],
};

// Whether the export of a skill that nixie wrote may move from one state to another: an opened
// pull request is built again on a new base or closed, and a closed one stays closed. The writer
// of the state checks it inside its write transaction.
export function canMoveSkillExport(from: SkillExportState, to: SkillExportState): boolean {
  return transitions[from].includes(to);
}
