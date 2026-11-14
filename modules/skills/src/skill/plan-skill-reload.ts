import type { DefinitionsInForce, SkillRef } from '@heynixie/definitions';

export interface SkillReloadInput {
  readonly pinned: readonly SkillRef[];
  readonly inForce: Pick<DefinitionsInForce, 'skills'>;

  readonly list: readonly string[];

  readonly name: string | null;
}

interface SkillChange {
  readonly name: string;
  readonly oldHash: string | null;
  readonly newHash: string | null;
}

export interface SkillReloadPlan {
  readonly skills: readonly SkillRef[];
  readonly changes: readonly SkillChange[];
}

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
