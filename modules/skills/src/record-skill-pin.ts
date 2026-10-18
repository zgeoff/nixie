import type { DefinitionsInForce, SkillRef } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { skillsPinnedCodec } from './skills-pinned-codec';

export interface SkillPinInput {
  readonly thread: string;

  // the definitions in force, whose skills on the caller's list the pin holds
  readonly inForce: Pick<DefinitionsInForce, 'snapshotHash' | 'personaVersion' | 'skills'>;

  // the names on the caller's skill list
  readonly list: readonly string[];
}

// Pins a task to the versions of the skills on its list that the definitions in force hold, and
// returns them in name order. A name on the list that the definitions lack pins nothing.
export async function recordSkillPin(log: Log, input: SkillPinInput): Promise<readonly SkillRef[]> {
  const listed = new Set(input.list);

  const skills = input.inForce.skills
    .filter((skill) => listed.has(skill.name))
    .map((skill) => ({ name: skill.name, skillHash: skill.skillHash, origin: skill.origin }))
    .toSorted((left, right) => (left.name < right.name ? -1 : 1));

  await writeRecords(log, [
    {
      kind: 'skills.pinned',
      thread: input.thread,
      definitions: {
        snapshotHash: input.inForce.snapshotHash,
        personaVersion: input.inForce.personaVersion,
      },
      payload: skillsPinnedCodec.encode({ skills }),
    },
  ]);

  return skills;
}
