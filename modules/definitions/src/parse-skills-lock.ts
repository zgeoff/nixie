import { z } from 'zod';
import type { ParseProblem } from './definitions-parse-error';

export const skillsLockPath = 'skills/skills.lock.json';

// each vendored skill's pin by its name
export type SkillsLock = z.infer<typeof lockSchema>;

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

  const parsed = lockSchema.safeParse(parseJSON(text));

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

// One vendored skill's pin: where it came from, the full commit it was copied at, and the content
// hash of its folder.
const lockEntrySchema = z.strictObject({
  source: z.url({ protocol: /^https$/u }),
  path: z.string().min(1),
  commit: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u, 'use the full commit SHA'),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/u, 'use the hex SHA-256 of the skill folder'),
});

const lockSchema = z.record(z.string(), lockEntrySchema);

// a lock that fails to parse fails the schema as a non-object
function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
