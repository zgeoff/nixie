import { countTextTokens } from '@heynixie/compaction';
import type { SkillVersion } from '@heynixie/definitions';

export interface SkillCatalog {
  readonly text: string | null;

  readonly isCut: boolean;
}

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
