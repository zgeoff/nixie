import type { DefinitionsInForce, SkillRef } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { loadSkillPin } from './load-skill-pin';
import { skillsPinnedCodec } from './skills-pinned-codec';
import { writePinRecord } from './write-pin-record';

export interface SkillPinInput {
  readonly thread: string;

  readonly inForce: Pick<DefinitionsInForce, 'snapshotHash' | 'personaVersion' | 'skills'>;

  readonly list: readonly string[];
}

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

  invariant(pin);

  return pin;
}
