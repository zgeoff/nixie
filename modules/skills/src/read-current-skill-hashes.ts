import { readDefinitionsInForce, readWrittenSkills } from '@heynixie/definitions';
import type { Kysely } from 'kysely';

// Reads the version of each skill that an answer to a proposal judges its base against, by name.
// An approval that committed before its seed ran stands in force already, so the skills nixie
// wrote that are in force lie over the snapshot in force.
export async function readCurrentSkillHashes(
  db: Kysely<unknown>,
): Promise<ReadonlyMap<string, string>> {
  const inForce = await readDefinitionsInForce(db);
  const written = await readWrittenSkills(db);

  return new Map([
    ...(inForce?.skills ?? []).map((skill) => [skill.name, skill.skillHash] as const),
    ...written.map((skill) => [skill.name, skill.skillHash] as const),
  ]);
}
