import type { SkillRef } from './types';

export interface SkillChanges {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

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
