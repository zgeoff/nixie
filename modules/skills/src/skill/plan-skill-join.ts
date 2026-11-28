import type { DefinitionsInForce, SkillRef } from '@heynixie/definitions';
import type { SkillReloadPlan } from './plan-skill-reload';

export interface SkillJoinInput {
  readonly pinned: readonly SkillRef[];
  readonly inForce: Pick<DefinitionsInForce, 'skills'>;
  readonly list: readonly string[];
}

// The pin with each listed skill it lacks added at the version in force. A listed name that no
// skill in force carries joins nothing.
export function planSkillJoin(input: SkillJoinInput): SkillReloadPlan {
  const held = new Set(input.pinned.map((skill) => skill.name));
  const listed = new Set(input.list);

  const joined = input.inForce.skills.filter(
    (skill) => listed.has(skill.name) && !held.has(skill.name),
  );

  const skills = [
    ...input.pinned,
    ...joined.map((skill) => ({
      name: skill.name,
      skillHash: skill.skillHash,
      origin: skill.origin,
    })),
  ].toSorted((left, right) => (left.name < right.name ? -1 : 1));

  const changes = joined
    .map((skill) => ({ name: skill.name, oldHash: null, newHash: skill.skillHash }))
    .toSorted((left, right) => (left.name < right.name ? -1 : 1));

  return { skills, changes };
}
