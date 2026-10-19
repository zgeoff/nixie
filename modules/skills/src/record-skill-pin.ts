import type { DefinitionsInForce, SkillRef } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { loadSkillPin } from './load-skill-pin';
import { skillsPinnedCodec } from './skills-pinned-codec';
import { writePinRecord } from './write-pin-record';

export interface SkillPinInput {
  readonly thread: string;

  // the definitions in force, whose skills on the caller's list the pin holds
  readonly inForce: Pick<DefinitionsInForce, 'snapshotHash' | 'personaVersion' | 'skills'>;

  // the names on the caller's skill list
  readonly list: readonly string[];
}

// Pins a task to the versions of the skills on its list that the definitions in force hold, and
// returns them in name order. A name on the list that the definitions lack pins nothing. A task
// pins once: when another load pinned it first, this returns that pin and writes nothing.
export async function recordSkillPin(log: Log, input: SkillPinInput): Promise<readonly SkillRef[]> {
  const listed = new Set(input.list);

  const skills = input.inForce.skills
    .filter((skill) => listed.has(skill.name))
    .map((skill) => ({ name: skill.name, skillHash: skill.skillHash, origin: skill.origin }))
    .toSorted((left, right) => (left.name < right.name ? -1 : 1));

  const isWritten = await writePinRecord(log, {
    kind: 'skills.pinned',
    thread: input.thread,
    definitions: {
      snapshotHash: input.inForce.snapshotHash,
      personaVersion: input.inForce.personaVersion,
    },
    payload: skillsPinnedCodec.encode({ skills }),
  });

  if (isWritten) {
    return skills;
  }

  const pin = await loadSkillPin(log, input.thread);

  // the transaction refused the first pin because a pin on the thread had committed
  invariant(pin);

  return pin;
}
