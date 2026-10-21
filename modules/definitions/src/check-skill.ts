import { buildContentHash } from './build-content-hash';
import type { ParseProblem } from './definitions-parse-error';
import { findHiddenCharacter } from './find-hidden-character';
import type { SkillDocument } from './parse-skill-frontmatter';
import { parseSkillFrontmatter } from './parse-skill-frontmatter';
import type { SkillsLock } from './parse-skills-lock';
import type { ParsedSkill } from './types';

export interface SkillFolder {
  readonly bytes: ReadonlyMap<string, Uint8Array>;
  readonly texts: ReadonlyMap<string, string>;
}

export interface SkillCheck {
  readonly skill: ParsedSkill | null;
  readonly problems: readonly ParseProblem[];
}

export function checkSkill(name: string, folder: SkillFolder, lock: SkillsLock): SkillCheck {
  const skillPath = `skills/${name}/SKILL.md`;
  const text = folder.texts.get('SKILL.md');
  const document = text === undefined ? ['the skill has no SKILL.md'] : parseSkillFrontmatter(text);
  const skillHash = buildContentHash(folder.bytes);
  const entry = Object.hasOwn(lock, name) ? lock[name] : undefined;

  const problems = [
    ...collectFrontmatterProblems(name, document).map((reason) => ({ path: skillPath, reason })),
    ...collectHiddenProblems(name, folder.texts),
    ...(entry === undefined || entry.contentHash === skillHash
      ? []
      : [
          {
            path: `skills/${name}/`,
            reason:
              `the files differ from the lock entry: the folder hashes to ${skillHash}, ` +
              `and the entry holds ${entry.contentHash}`,
          },
        ]),
  ];

  if (problems.length > 0 || isProblemList(document)) {
    return { skill: null, problems };
  }

  const skill: ParsedSkill = {
    name,
    skillHash,
    origin: entry === undefined ? 'definitions' : 'vendored',
    frontmatter: document.frontmatter,
    files: folder.texts,
  };

  return { skill, problems: [] };
}

function collectFrontmatterProblems(
  name: string,
  document: SkillDocument | readonly string[],
): readonly string[] {
  if (isProblemList(document)) {
    return document;
  }

  const named = document.frontmatter.name;

  return named === name ? [] : [`the name ${named} differs from its folder name ${name}`];
}

function isProblemList(document: SkillDocument | readonly string[]): document is readonly string[] {
  return Array.isArray(document);
}

function collectHiddenProblems(
  name: string,
  texts: ReadonlyMap<string, string>,
): readonly ParseProblem[] {
  return [...texts].flatMap(([path, text]) => {
    const hidden = findHiddenCharacter(text);

    if (hidden === null) {
      return [];
    }

    const line = String(hidden.line);

    return [
      {
        path: `skills/${name}/${path}`,
        reason: `line ${line} holds ${hidden.codePoint}, a hidden or bidirectional control character`,
      },
    ];
  });
}
