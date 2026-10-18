import { z } from 'zod';
import type { SkillFrontmatter } from './types';

// The Agent Skills rules for a name: 1 to 64 lowercase letters, digits and hyphens, with no hyphen
// at either end and no 2 in a row.
const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

// The fields nixie reads, with the format's limits. The format leaves other fields to each product,
// so the schema keeps them out of the skill and refuses none.
const frontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(skillNamePattern, 'use lowercase letters, digits and single hyphens inside the name'),
  description: z
    .string()
    .max(1024)
    .refine((description) => description.trim().length > 0, 'the description is empty'),
  license: z.string().min(1).optional(),
  compatibility: z.string().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  'allowed-tools': z.string().optional(),
});

// The parts of a SKILL.md: its frontmatter, and the body after it.
export interface SkillDocument {
  readonly frontmatter: SkillFrontmatter;
  readonly body: string;
}

// Parses the YAML frontmatter that opens a SKILL.md and checks it against the Agent Skills format.
// It returns the reasons a frontmatter fails, each naming its field, or the parsed document.
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

  const parsed = frontmatterSchema.safeParse(fields);

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
