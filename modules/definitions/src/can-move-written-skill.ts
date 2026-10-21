import type { WrittenSkillState } from './types';

const transitions: Readonly<Record<WrittenSkillState, readonly WrittenSkillState[]>> = {
  in_force: ['adopted', 'superseded', 'retired'],
  adopted: [],
  superseded: [],
  retired: [],
};

export function canMoveWrittenSkill(from: WrittenSkillState, to: WrittenSkillState): boolean {
  return transitions[from].includes(to);
}
