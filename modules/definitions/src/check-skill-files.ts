import { normalize } from 'node:path/posix';
import { defaultSizeLimits } from './default-size-limits';
import type { ParseProblem } from './definitions-parse-error';
import { DefinitionsParseError } from './definitions-parse-error';
import { findHiddenCharacter } from './find-hidden-character';
import { isDefinitionsPath } from './is-definitions-path';
import { parseSkills } from './parse-skills';
import { skillNamePattern } from './skill-name-pattern';
import type { ParsedSkill, SizeLimits } from './types';

// Runs the seed checks on a skill that nixie writes: a name the format allows, each path as the
// definitions source would read it, the size limits a snapshot keeps to, and every check the seed
// runs on a skill, on the files whose paths pass. It returns the checked skill, or every problem.
export function checkSkillFiles(
  name: string,
  files: readonly { readonly path: string; readonly text: string }[],
  limits: SizeLimits = defaultSizeLimits,
): ParsedSkill | readonly ParseProblem[] {
  if (!skillNamePattern.test(name) || name.length > 64) {
    return [
      { path: `skills/${name}/`, reason: 'use lowercase letters, digits and single hyphens' },
    ];
  }

  const encoder = new TextEncoder();

  const paths = files.map((file) => file.path);

  const entries = files.map((file, index) => ({
    path: `skills/${name}/${file.path}`,
    text: file.text,
    bytes: encoder.encode(file.text),
    pathProblem: findPathProblem(name, paths, index),
  }));

  const kept = entries.filter((entry) => entry.pathProblem === null);

  const problems = [
    ...entries.flatMap((entry) =>
      entry.pathProblem === null ? [] : [{ path: entry.path, reason: entry.pathProblem }],
    ),
    ...entries
      .filter((entry) => entry.bytes.byteLength > limits.maxFileBytes)
      .map((entry) => ({
        path: entry.path,
        reason: `the file is past the ${String(limits.maxFileBytes)}-byte limit`,
      })),
    ...(entries.reduce((total, entry) => total + entry.bytes.byteLength, 0) > limits.maxTotalBytes
      ? [
          {
            path: `skills/${name}/`,
            reason: `the files are past the ${String(limits.maxTotalBytes)}-byte limit in all`,
          },
        ]
      : []),
  ];

  // a skill whose every path failed has no files left for the seed checks to read
  if (kept.length === 0 && files.length > 0) {
    return problems;
  }

  const checked = tryParseSkill(
    new Map(kept.map((entry) => [entry.path, entry.bytes])),
    new Map(kept.map((entry) => [entry.path, entry.text])),
  );

  if (isProblemList(checked)) {
    return [...problems, ...checked];
  }

  return problems.length > 0 ? problems : checked;
}

// The reason the path at the index fails, or null. A path names a file inside the skill's folder in
// the plain form the definitions source reads, so 2 paths name one file only when they are equal.
function findPathProblem(name: string, paths: readonly string[], index: number): string | null {
  const path = paths[index] ?? '';
  const normalized = normalize(path);

  const isOutside =
    path === '' ||
    path.startsWith('/') ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../');

  if (isOutside) {
    return "the path is outside the skill's folder";
  }

  if (normalized !== path || path.endsWith('/')) {
    return 'write the path in its plain form, with no ./, // or final /';
  }

  if (!isDefinitionsPath(`skills/${name}/${path}`)) {
    return 'the definitions source skips a path with a part that starts with a dot';
  }

  const hidden = findHiddenCharacter(path);

  if (hidden !== null) {
    return `the path holds ${hidden.codePoint}, a hidden or bidirectional control character`;
  }

  return findCollision(paths, index);
}

// A folder on a disk that ignores case holds SKILL.md and skill.md as one file, and no path can be
// both a file and the folder of another.
function findCollision(paths: readonly string[], index: number): string | null {
  const path = paths[index] ?? '';
  const folded = path.toLowerCase();

  if (paths.slice(0, index).some((other) => other.toLowerCase() === folded)) {
    return 'the path names a file that an earlier path names';
  }

  if (paths.some((other) => other.toLowerCase().startsWith(`${folded}/`))) {
    return 'the path names a file that another path uses as a folder';
  }

  return null;
}

function tryParseSkill(
  bytes: ReadonlyMap<string, Uint8Array>,
  texts: ReadonlyMap<string, string>,
): ParsedSkill | readonly ParseProblem[] {
  try {
    const [skill] = parseSkills({ files: bytes }, texts);

    return skill ?? [{ path: 'skills/', reason: 'the skill has no files' }];
  } catch (error) {
    if (error instanceof DefinitionsParseError) {
      return error.problems;
    }

    throw error;
  }
}

function isProblemList(
  checked: ParsedSkill | readonly ParseProblem[],
): checked is readonly ParseProblem[] {
  return Array.isArray(checked);
}
