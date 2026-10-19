import type { DefinitionsInForce, SkillRef } from '@heynixie/definitions';

export interface SkillReloadInput {
  // the versions the task runs with now
  readonly pinned: readonly SkillRef[];
  readonly inForce: Pick<DefinitionsInForce, 'skills'>;

  // the names on the caller's skill list in the definitions in force
  readonly list: readonly string[];

  // the one skill to move on, or null for every skill the task holds or its list names
  readonly name: string | null;
}

interface SkillChange {
  readonly name: string;
  readonly oldHash: string | null;
  readonly newHash: string | null;
}

// A reload's outcome: the task's pin after it, and each skill's old and new version.
export interface SkillReloadPlan {
  readonly skills: readonly SkillRef[];
  readonly changes: readonly SkillChange[];
}

// Plans a reload: each skill it moves takes the version the definitions in force hold for a skill
// on the caller's list, and leaves the pin when the list or the definitions no longer hold it.
// Every other skill keeps its version.
export function planSkillReload(input: SkillReloadInput): SkillReloadPlan {
  const listed = new Set(input.list);

  const fresh = new Map(
    input.inForce.skills
      .filter((skill) => listed.has(skill.name))
      .map((skill) => [skill.name, skill]),
  );

  const pinned = new Map(input.pinned.map((skill) => [skill.name, skill]));

  const names =
    input.name === null
      ? [...new Set([...pinned.keys(), ...fresh.keys()])].toSorted()
      : [input.name];

  const moved = new Set(names);

  const skills = [
    ...input.pinned.filter((skill) => !moved.has(skill.name)),
    ...names.flatMap((name) => {
      const skill = fresh.get(name);

      return skill === undefined
        ? []
        : [{ name: skill.name, skillHash: skill.skillHash, origin: skill.origin }];
    }),
  ].toSorted((left, right) => (left.name < right.name ? -1 : 1));

  const changes = names.map((name) => ({
    name,
    oldHash: pinned.get(name)?.skillHash ?? null,
    newHash: fresh.get(name)?.skillHash ?? null,
  }));

  return { skills, changes };
}
