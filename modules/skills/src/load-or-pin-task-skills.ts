import type {
  DefinitionsInForce,
  SkillOrigin,
  SkillRef,
  SkillVersion,
} from '@heynixie/definitions';
import { findSkillVersions } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { findSkillPin } from './find-skill-pin';
import { recordSkillPin } from './record-skill-pin';

export interface TaskSkillsQuery {
  readonly thread: string;

  // the definitions in force, which a task's first load pins it to, or null before the first seed
  readonly inForce: DefinitionsInForce | null;

  // the names on the caller's skill list in the definitions in force
  readonly list: readonly string[];
}

// a skill version a task runs with, and where it came from
export interface TaskSkill extends SkillVersion {
  readonly origin: SkillOrigin;
}

// Loads the skill versions a task runs with, in name order. A task's first load records a pin to the
// versions of its list in the definitions in force, so a later seed leaves the task on its pin.
// Before the first seed, a task has no skills and no pin.
export async function loadOrPinTaskSkills(
  log: Log,
  query: TaskSkillsQuery,
): Promise<readonly TaskSkill[]> {
  const pin = await readOrRecordPin(log, query);

  const versions = await findSkillVersions(
    log.writer.db,
    pin.map((skill) => skill.skillHash),
  );

  return pin.flatMap((skill) => {
    const version = versions.get(skill.skillHash);

    return version === undefined ? [] : [{ ...version, origin: skill.origin }];
  });
}

// the task's newest pin, or a first pin from the definitions in force
async function readOrRecordPin(log: Log, query: TaskSkillsQuery): Promise<readonly SkillRef[]> {
  const pin = await findSkillPin(log, query.thread);

  if (pin !== null) {
    return pin;
  }

  if (query.inForce === null) {
    return [];
  }

  return recordSkillPin(log, { thread: query.thread, inForce: query.inForce, list: query.list });
}
