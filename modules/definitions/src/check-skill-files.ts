import { normalize } from 'node:path/posix';
import { defaultSizeLimits } from './default-size-limits';
import type { ParseProblem } from './definitions-parse-error';
import { DefinitionsParseError } from './definitions-parse-error';
import { parseSkills } from './parse-skills';
import { skillNamePattern } from './skill-name-pattern';
import type { ParsedSkill, SizeLimits } from './types';

// Runs the seed checks on a skill that nixie writes: a name the format allows, each path inside the
// skill's folder, the size limits a snapshot keeps to, and every check the seed runs on a skill in
// the definitions. It returns the checked skill, or every problem it found.
export function checkSkillFiles(
  name: string,
  files: ReadonlyMap<string, string>,
  limits: SizeLimits = defaultSizeLimits,
): ParsedSkill | readonly ParseProblem[] {
  if (!skillNamePattern.test(name) || name.length > 64) {
    return [
      { path: `skills/${name}/`, reason: 'use lowercase letters, digits and single hyphens' },
    ];
  }

  const encoder = new TextEncoder();

  const entries = [...files].map(([path, text]) => ({ path, text, bytes: encoder.encode(text) }));

  const problems = [
    ...entries.flatMap((entry) => findPathProblems(name, entry.path)),
    ...entries
      .filter((entry) => entry.bytes.byteLength > limits.maxFileBytes)
      .map((entry) => ({
        path: `skills/${name}/${entry.path}`,
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

  if (problems.length > 0) {
    return problems;
  }

  const paths = entries.map((entry) => `skills/${name}/${normalize(entry.path)}`);

  return tryParseSkill(
    new Map(entries.map((entry, index) => [paths[index] ?? '', entry.bytes])),
    new Map(entries.map((entry, index) => [paths[index] ?? '', entry.text])),
  );
}

function findPathProblems(name: string, path: string): readonly ParseProblem[] {
  const normalized = normalize(path);

  const isOutside =
    path === '' ||
    path.startsWith('/') ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../');

  return isOutside
    ? [{ path: `skills/${name}/${path}`, reason: "the path is outside the skill's folder" }]
    : [];
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
