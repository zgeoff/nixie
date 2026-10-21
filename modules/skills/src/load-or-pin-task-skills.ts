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
}

export interface TaskSkill extends SkillVersion {
  readonly origin: SkillOrigin;
}

export async function loadOrPinTaskSkills(
  log: Log,
  query: TaskSkillsQuery,
): Promise<readonly TaskSkill[]> {
  const pin = await readOrRecordPin(log, query);

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
