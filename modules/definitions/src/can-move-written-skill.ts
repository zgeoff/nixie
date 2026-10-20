import type { WrittenSkillState } from './types';

const transitions: Readonly<Record<WrittenSkillState, readonly WrittenSkillState[]>> = {
  in_force: ['adopted', 'superseded', 'retired'],
  adopted: [],
  superseded: [],
  retired: [],
};

// Whether a skill that nixie wrote may move from one state to another: only a skill in force moves,
// once, when a seed adopts it, a later approval supersedes it, or you retire it. Every writer of
// the state checks it inside its write transaction.
export function canMoveWrittenSkill(from: WrittenSkillState, to: WrittenSkillState): boolean {
  return transitions[from].includes(to);
}
