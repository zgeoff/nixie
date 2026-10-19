import type { DefinitionsInForce } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import type { SkillReloadPlan } from './plan-skill-reload';
import { skillsReloadedCodec } from './skills-reloaded-codec';
import { writePinRecord } from './write-pin-record';

export interface SkillReloadRecord {
  readonly thread: string;
  readonly inForce: Pick<DefinitionsInForce, 'snapshotHash' | 'personaVersion'>;
  readonly plan: SkillReloadPlan;
}

// Records a reload on the task's thread, under the definitions it moved the task to. The record
// becomes the task's pin, and the next turn's note names the skills it changed. A reload moves
// only a pinned task on, so it returns false, and writes nothing, for a task with no pin.
export function recordSkillReload(log: Log, input: SkillReloadRecord): Promise<boolean> {
  return writePinRecord(log, {
    kind: 'skills.reloaded',
    thread: input.thread,
    definitions: {
      snapshotHash: input.inForce.snapshotHash,
      personaVersion: input.inForce.personaVersion,
    },
    payload: skillsReloadedCodec.encode({
      skills: input.plan.skills.map((skill) => ({
        name: skill.name,
        skillHash: skill.skillHash,
        origin: skill.origin,
      })),
      changes: input.plan.changes.map((change) => ({
        name: change.name,
        oldHash: change.oldHash,
        newHash: change.newHash,
      })),
    }),
  });
}
