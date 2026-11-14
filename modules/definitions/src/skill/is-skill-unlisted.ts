import { manifestSkillsSchema } from './manifest-skills-schema';

export function isSkillUnlisted(manifest: string | null, name: string): boolean {
  if (manifest === null) {
    return false;
  }

  const parsed = manifestSkillsSchema.safeParse(parseYAML(manifest));

  return parsed.success && parsed.data.skills !== undefined && !parsed.data.skills.includes(name);
}

function parseYAML(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch {
    return null;
  }
}
