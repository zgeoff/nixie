import type { SkillRef } from './types';

// The skills a seed adds, changes and removes against the definitions it replaces, each list in
// name order. The seed's record holds them as its notice: a skill grants nothing, so a new or
// changed skill applies at once and only asks to be seen.
export function buildSkillChanges(
  previous: readonly SkillRef[],
  next: readonly SkillRef[],
): SkillChanges {
  const before = new Map(previous.map((skill) => [skill.name, skill.skillHash]));
  const after = new Map(next.map((skill) => [skill.name, skill.skillHash]));

  return {
    added: [...after.keys()].filter((name) => !before.has(name)).toSorted(),
    changed: [...after]
      .filter(([name, skillHash]) => before.has(name) && before.get(name) !== skillHash)
      .map(([name]) => name)
      .toSorted(),
    removed: [...before.keys()].filter((name) => !after.has(name)).toSorted(),
  };
}

export interface SkillChanges {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}
