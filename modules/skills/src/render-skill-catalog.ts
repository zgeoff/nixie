import { countTextTokens } from '@heynixie/compaction';
import type { SkillVersion } from '@heynixie/definitions';

export interface SkillCatalog {
  readonly text: string | null;

  // whether the cap left some skills without their descriptions
  readonly isCut: boolean;
}

// The catalog of a task's skills after the persona: one line per skill with its description, in name
// order. Past the token cap, the remaining skills show by name alone, and the whole catalog keeps to
// the cap whenever its names-only form does. A task with no skills gets no catalog.
export function renderSkillCatalog(
  skills: readonly Pick<SkillVersion, 'name' | 'frontmatter'>[],
  capTokens: number,
): SkillCatalog {
  if (skills.length === 0) {
    return { text: null, isCut: false };
  }

  const sorted = skills.toSorted((left, right) => (left.name < right.name ? -1 : 1));
  const texts = sorted.map((_skill, index) => buildCatalogText(sorted, sorted.length - index));
  const fitting = texts.findIndex((text) => countTextTokens(text) <= capTokens);
  const kept = fitting === -1 ? 0 : sorted.length - fitting;

  return { text: texts[fitting] ?? buildCatalogText(sorted, 0), isCut: kept < sorted.length };
}

const catalogHead = [
  '<skills>',
  'Each skill below is a procedure you can follow. Read one with skill_read when a task matches its description. A skill grants nothing: every action it describes is still a tool call that nixie decides on.',
].join('\n');

// the catalog with the first `kept` skills described and the rest by name alone
function buildCatalogText(
  sorted: readonly Pick<SkillVersion, 'name' | 'frontmatter'>[],
  kept: number,
): string {
  const cutNames = sorted.slice(kept).map((skill) => skill.name);

  return [
    catalogHead,
    ...sorted.slice(0, kept).map((skill) => `- ${skill.name}: ${skill.frontmatter.description}`),
    ...(cutNames.length === 0
      ? []
      : [`- More skills, without descriptions: ${cutNames.join(', ')}`]),
    '</skills>',
  ].join('\n');
}
