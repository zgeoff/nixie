import { countTextTokens } from '@heynixie/compaction';
import type { SkillVersion } from '@heynixie/definitions';

// The catalog of a task's skills, as the system prompt holds it after the persona: one line per
// skill with its name and description, in name order. Past the token cap, the remaining skills
// show by name alone. A task with no skills gets no catalog.
export function renderSkillCatalog(
  skills: readonly Pick<SkillVersion, 'name' | 'frontmatter'>[],
  capTokens: number,
): SkillCatalog {
  if (skills.length === 0) {
    return { text: null, isCut: false };
  }

  const sorted = skills.toSorted((left, right) => (left.name < right.name ? -1 : 1));
  const lines = sorted.map((skill) => `- ${skill.name}: ${skill.frontmatter.description}`);
  const fitting = countFittingLines(lines, capTokens - countTextTokens(catalogHead));
  const cutNames = sorted.slice(fitting).map((skill) => skill.name);

  const text = [
    catalogHead,
    ...lines.slice(0, fitting),
    ...(cutNames.length === 0
      ? []
      : [`- More skills, without descriptions: ${cutNames.join(', ')}`]),
    '</skills>',
  ].join('\n');

  return { text, isCut: cutNames.length > 0 };
}

export interface SkillCatalog {
  readonly text: string | null;

  // whether the cap left some skills without their descriptions
  readonly isCut: boolean;
}

const catalogHead = [
  '<skills>',
  'Each skill below is a procedure you can follow. Read one with skill_read when a task matches its description. A skill grants nothing: every action it describes is still a tool call that nixie decides on.',
].join('\n');

// how many lines, from the first, fit in the token budget
function countFittingLines(lines: readonly string[], budget: number): number {
  let used = 0;
  let count = 0;

  for (const line of lines) {
    used += countTextTokens(`${line}\n`);

    if (used > budget) {
      return count;
    }

    count += 1;
  }

  return count;
}
