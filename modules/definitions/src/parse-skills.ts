import { buildContentHash } from './build-content-hash';
import type { ParseProblem } from './definitions-parse-error';
import { DefinitionsParseError } from './definitions-parse-error';
import { findHiddenCharacter } from './find-hidden-character';
import type { SkillDocument } from './parse-skill-frontmatter';
import { parseSkillFrontmatter } from './parse-skill-frontmatter';
import type { SkillsLock } from './parse-skills-lock';
import { parseSkillsLock, skillsLockPath } from './parse-skills-lock';
import type { ParsedSkill, Snapshot } from './types';

// Reads every skill under skills/ and runs the seed checks on each: the frontmatter and its name, no
// hidden or bidirectional control character, and a vendored skill's lock entry. A failed check
// throws with every problem it found.
export function parseSkills(
  snapshot: Pick<Snapshot, 'files'>,
  texts: ReadonlyMap<string, string>,
): readonly ParsedSkill[] {
  const lock = parseSkillsLock(texts.get(skillsLockPath));
  const split = splitSkillFolders(snapshot.files, texts);
  const entries = lock.problems.length === 0 ? lock.entries : {};

  const checked = [...split.folders.entries()]
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([name, folder]) => checkSkill(name, folder, entries));

  const problems = [
    ...lock.problems,
    ...split.problems,
    ...findOrphanedEntries(entries, split.folders),
    ...checked.flatMap((check) => check.problems),
  ];

  if (problems.length > 0) {
    throw new DefinitionsParseError(problems);
  }

  return checked.flatMap((check) => (check.skill === null ? [] : [check.skill]));
}

// one skill's files by their path inside its folder, as bytes for the hash and as text
interface SkillFolder {
  readonly bytes: Map<string, Uint8Array>;
  readonly texts: Map<string, string>;
}

interface SplitFolders {
  readonly folders: ReadonlyMap<string, SkillFolder>;

  // the files under skills/ that sit in no skill's folder
  readonly problems: readonly ParseProblem[];
}

function splitSkillFolders(
  files: ReadonlyMap<string, Uint8Array>,
  texts: ReadonlyMap<string, string>,
): SplitFolders {
  const folders = new Map<string, SkillFolder>();

  const problems: ParseProblem[] = [];

  for (const [path, bytes] of files) {
    const [root, name, ...rest] = path.split('/');

    if (root !== 'skills' || name === undefined || path === skillsLockPath) {
      continue;
    }

    if (rest.length === 0) {
      problems.push({ path, reason: "a file under skills/ belongs in a skill's folder" });
      continue;
    }

    const folder = folders.get(name) ?? { bytes: new Map(), texts: new Map() };

    folder.bytes.set(rest.join('/'), bytes);
    folder.texts.set(rest.join('/'), texts.get(path) ?? '');
    folders.set(name, folder);
  }

  return { folders, problems };
}

interface SkillCheck {
  readonly skill: ParsedSkill | null;
  readonly problems: readonly ParseProblem[];
}

function checkSkill(name: string, folder: SkillFolder, lock: SkillsLock): SkillCheck {
  const skillPath = `skills/${name}/SKILL.md`;
  const text = folder.texts.get('SKILL.md');
  const document = text === undefined ? ['the skill has no SKILL.md'] : parseSkillFrontmatter(text);
  const skillHash = buildContentHash(folder.bytes);
  const entry = Object.hasOwn(lock, name) ? lock[name] : undefined;

  const problems = [
    ...findFrontmatterProblems(name, document).map((reason) => ({ path: skillPath, reason })),
    ...findHiddenProblems(name, folder.texts),
    ...(entry === undefined || entry.contentHash === skillHash
      ? []
      : [
          {
            path: `skills/${name}/`,
            reason:
              `the files differ from the lock entry: the folder hashes to ${skillHash}, ` +
              `and the entry pins ${entry.contentHash}`,
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

function findFrontmatterProblems(
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

function findHiddenProblems(
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

// a lock entry with no skill folder pins nothing, such as the stale entry of a removed skill
function findOrphanedEntries(
  lock: SkillsLock,
  folders: ReadonlyMap<string, SkillFolder>,
): readonly ParseProblem[] {
  return Object.keys(lock)
    .filter((name) => !folders.has(name))
    .toSorted()
    .map((name) => ({
      path: skillsLockPath,
      reason: `${name}: no skill folder matches the entry`,
    }));
}
