import { DefinitionsParseError } from './definitions-parse-error';
import { manifestPath } from './manifest-path';
import { manifestSkillsSchema } from './manifest-skills-schema';
import type { ParsedSkill } from './types';

export function parseConversationSkills(
  manifest: string,
  skills: readonly ParsedSkill[],
): readonly string[] {
  const parsed = manifestSkillsSchema.safeParse(Bun.YAML.parse(manifest));

  if (!parsed.success) {
    throw new DefinitionsParseError([
      { path: manifestPath, reason: 'skills must be a list of skill names' },
    ]);
  }

  const listed = parsed.data.skills;

  if (listed === undefined) {
    return skills.map((skill) => skill.name).toSorted();
  }

  const known = new Set(skills.map((skill) => skill.name));

  const unknown = listed.filter((name) => !known.has(name));

  if (unknown.length > 0) {
    throw new DefinitionsParseError(
      unknown.map((name) => ({ path: manifestPath, reason: `skills: no skill is named ${name}` })),
    );
  }

  return [...new Set(listed)].toSorted();
}
