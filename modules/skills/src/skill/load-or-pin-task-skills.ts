import type {
  DefinitionsInForce,
  SkillOrigin,
  SkillRef,
  SkillVersion,
} from '@heynixie/definitions';
import { loadSkillVersions } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { loadSkillPin } from './load-skill-pin';
import { recordSkillPin } from './record-skill-pin';

export interface TaskSkillsQuery {
  readonly thread: string;

  readonly inForce: DefinitionsInForce | null;

  readonly list: readonly string[];

  // Set for a run whose list is its own, such as a job run or a worker run. The result then holds
  // only the pinned skills on the list, so a skill off the list stays out whatever the thread pinned.
  readonly isRestricted?: boolean;
}

export interface TaskSkill extends SkillVersion {
  readonly origin: SkillOrigin;
}

export async function loadOrPinTaskSkills(
  log: Log,
  query: TaskSkillsQuery,
): Promise<readonly TaskSkill[]> {
  const recorded = await readOrRecordPin(log, query);

  const listed = new Set(query.list);

  const pin =
    query.isRestricted === true ? recorded.filter((skill) => listed.has(skill.name)) : recorded;

  const versions = await loadSkillVersions(
    log.writer.db,
    pin.map((skill) => skill.skillHash),
  );

  return pin.flatMap((skill) => {
    const version = versions.get(skill.skillHash);

    return version === undefined ? [] : [{ ...version, origin: skill.origin }];
  });
}

async function readOrRecordPin(log: Log, query: TaskSkillsQuery): Promise<readonly SkillRef[]> {
  const pin = await loadSkillPin(log, query.thread);

  if (pin !== null) {
    return pin;
  }

  if (query.inForce === null) {
    return [];
  }

  return recordSkillPin(log, { thread: query.thread, inForce: query.inForce, list: query.list });
}
