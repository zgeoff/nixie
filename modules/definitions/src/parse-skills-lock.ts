import type { z } from 'zod';
import type { ParseProblem } from './definitions-parse-error';
import { skillsLockPath } from './skills-lock-path';
import { skillsLockSchema } from './skills-lock-schema';

// each vendored skill's lock entry by its name
export type SkillsLock = z.infer<typeof skillsLockSchema>;

export interface ParsedSkillsLock {
  readonly entries: SkillsLock;

  // the faults that refuse the snapshot, none for a lock that parsed
  readonly problems: readonly ParseProblem[];
}

// Parses skills.lock.json. A snapshot with no lock file vendors no skill.
export function parseSkillsLock(text: string | undefined): ParsedSkillsLock {
  if (text === undefined) {
    return { entries: {}, problems: [] };
  }

  const parsed = skillsLockSchema.safeParse(parseJSON(text));

  if (parsed.success) {
    return { entries: parsed.data, problems: [] };
  }

  const problems = parsed.error.issues.map((issue) => ({
    path: skillsLockPath,
    reason:
      issue.path.length === 0
        ? 'the lock is not a JSON object'
        : `${issue.path.join('.')}: ${issue.message}`,
  }));

  return { entries: {}, problems };
}

// a lock that fails to parse fails the schema as a non-object
function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
