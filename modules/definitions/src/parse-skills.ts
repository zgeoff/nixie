import type { SkillFolder } from './check-skill';
import { checkSkill } from './check-skill';
import type { ParseProblem } from './definitions-parse-error';
import { DefinitionsParseError } from './definitions-parse-error';
import type { SkillsLock } from './parse-skills-lock';
import { parseSkillsLock } from './parse-skills-lock';
import { skillsLockPath } from './skills-lock-path';
import type { ParsedSkill, Snapshot } from './types';

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
    ...collectOrphanedEntries(entries, split.folders),
    ...checked.flatMap((check) => check.problems),
  ];

  if (problems.length > 0) {
    throw new DefinitionsParseError(problems);
  }

  return checked.flatMap((check) => (check.skill === null ? [] : [check.skill]));
}

interface SplitFolders {
  readonly folders: ReadonlyMap<string, SkillFolder>;

  readonly problems: readonly ParseProblem[];
}

function splitSkillFolders(
  files: ReadonlyMap<string, Uint8Array>,
  texts: ReadonlyMap<string, string>,
): SplitFolders {
  const folders = new Map<
    string,
    { readonly bytes: Map<string, Uint8Array>; readonly texts: Map<string, string> }
  >();

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
    folder.texts.set(rest.join('/'), restoreByteOrderMark(bytes, texts.get(path) ?? ''));
    folders.set(name, folder);
  }

  return { folders, problems };
}

// The UTF-8 TextDecoder drops a leading byte order mark, which the hash still covers, so the text
// gets it back from the bytes and the hidden-character check sees it.
function restoreByteOrderMark(bytes: Uint8Array, text: string): string {
  const hasMark = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

  return hasMark && !text.startsWith('﻿') ? `﻿${text}` : text;
}

function collectOrphanedEntries(
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
