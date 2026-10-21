import { normalize } from 'node:path/posix';
import { checkSkill } from './check-skill';
import { defaultSizeLimits } from './default-size-limits';
import type { ParseProblem } from './definitions-parse-error';
import { findHiddenCharacter } from './find-hidden-character';
import { isDefinitionsPath } from './is-definitions-path';
import { normalizeLineEndings } from './normalize-line-endings';
import { skillNamePattern } from './skill-name-pattern';
import type { ParsedSkill, SizeLimits } from './types';

export function checkSkillFiles(
  name: string,
  files: readonly { readonly path: string; readonly text: string }[],
  limits: SizeLimits = defaultSizeLimits,
): ParsedSkill | readonly ParseProblem[] {
  const encoder = new TextEncoder();

  // The UTF-8 TextDecoder drops a leading byte order mark unless ignoreBOM is set.
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

  const paths = files.map((file) => file.path);

  const entries = files.map((file, index) => {
    const raw = encoder.encode(file.text);
    const bytes = normalizeLineEndings(raw);

    return {
      inner: file.path,
      path: `skills/${name}/${file.path}`,
      size: raw.byteLength,
      bytes,
      text: decoder.decode(bytes),
      pathProblem: findPathProblem(paths, index),
    };
  });

  const kept = entries.filter((entry) => entry.pathProblem === null);

  const problems = [
    ...(skillNamePattern.test(name) && name.length <= 64
      ? []
      : [{ path: `skills/${name}/`, reason: 'use lowercase letters, digits and single hyphens' }]),
    ...entries.flatMap((entry) =>
      entry.pathProblem === null ? [] : [{ path: entry.path, reason: entry.pathProblem }],
    ),
    ...entries
      .filter((entry) => entry.size > limits.maxFileBytes)
      .map((entry) => ({
        path: entry.path,
        reason: `the file is past the ${String(limits.maxFileBytes)}-byte limit`,
      })),
    ...(entries.reduce((total, entry) => total + entry.size, 0) > limits.maxTotalBytes
      ? [
          {
            path: `skills/${name}/`,
            reason: `the files are past the ${String(limits.maxTotalBytes)}-byte limit in all`,
          },
        ]
      : []),
  ];

  if (kept.length === 0 && files.length > 0) {
    return problems;
  }

  if (kept.length === 0) {
    return [...problems, { path: `skills/${name}/`, reason: 'the skill has no files' }];
  }

  const checked = checkSkill(
    name,
    {
      bytes: new Map(kept.map((entry) => [entry.inner, entry.bytes])),
      texts: new Map(kept.map((entry) => [entry.inner, entry.text])),
    },
    {},
  );

  const all = [...problems, ...checked.problems];

  return checked.skill === null || all.length > 0 ? all : checked.skill;
}

function findPathProblem(paths: readonly string[], index: number): string | null {
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

  if (!isDefinitionsPath(`skills/${path}`)) {
    return 'the definitions source skips a path with a part that starts with a dot';
  }

  const hidden = findHiddenCharacter(path);

  if (hidden !== null) {
    return `the path holds ${hidden.codePoint}, a hidden or bidirectional control character`;
  }

  return findCollision(paths, index);
}

// A disk that ignores case holds SKILL.md and skill.md as one file, and no filesystem lets a path
// be both a file and a folder.
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
