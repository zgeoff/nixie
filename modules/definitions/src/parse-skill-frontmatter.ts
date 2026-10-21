import { skillFrontmatterSchema } from './skill-frontmatter-schema';
import type { SkillFrontmatter } from './types';

export interface SkillDocument {
  readonly frontmatter: SkillFrontmatter;
  readonly body: string;
}

export function parseSkillFrontmatter(text: string): SkillDocument | readonly string[] {
  const match = /^---\n(?<yaml>[\s\S]*?)\n---(?:\n|$)/u.exec(text);
  const yaml = match?.groups?.['yaml'];

  if (match === null || yaml === undefined) {
    return ['the file does not open with YAML frontmatter between --- lines'];
  }

  const fields = parseYAML(yaml);

  if (fields instanceof Error) {
    return [`the frontmatter is not YAML: ${fields.message}`];
  }

  const parsed = skillFrontmatterSchema.safeParse(fields);

  if (!parsed.success) {
    return parsed.error.issues.map((issue) =>
      issue.path.length === 0
        ? 'the frontmatter is not a YAML mapping'
        : `${issue.path.join('.')}: ${issue.message}`,
    );
  }

  return {
    frontmatter: {
      name: parsed.data.name,
      description: parsed.data.description,
      license: parsed.data.license ?? null,
      compatibility: parsed.data.compatibility ?? null,
      allowedTools: parsed.data['allowed-tools'] ?? null,
      metadata: parsed.data.metadata ?? {},
    },
    body: text.slice(match[0].length),
  };
}

function parseYAML(yaml: string): unknown {
  try {
    return Bun.YAML.parse(yaml);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
