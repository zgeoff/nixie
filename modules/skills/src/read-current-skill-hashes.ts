import {
  readDefinitionsInForce,
  readDefinitionsSkills,
  readWrittenSkills,
} from '@heynixie/definitions';
import type { Kysely } from 'kysely';

export async function readCurrentSkillHashes(
  db: Kysely<unknown>,
): Promise<ReadonlyMap<string, string>> {
  const inForce = await readDefinitionsInForce(db);
  const written = await readWrittenSkills(db);

  const writtenHashes = written.map((skill) => [skill.name, skill.skillHash] as const);

  if (inForce === null) {
    return new Map(writtenHashes);
  }

  const definitions = await readDefinitionsSkills(db, inForce.snapshotHash);

  return new Map([
    ...definitions.skills.map((skill) => [skill.name, skill.skillHash] as const),
    ...writtenHashes,
  ]);
}
