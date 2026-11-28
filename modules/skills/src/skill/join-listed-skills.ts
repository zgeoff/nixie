import type { DefinitionsInForce } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { loadSkillPin } from './load-skill-pin';
import { planSkillJoin } from './plan-skill-join';
import { recordSkillPin } from './record-skill-pin';
import { recordSkillReload } from './record-skill-reload';

export interface JoinListedSkillsInput {
  readonly thread: string;
  readonly inForce: DefinitionsInForce | null;
  readonly list: readonly string[];
}

// Puts each skill of a list on its thread's pin, so a task that outlives a change to its
// definition's list holds each skill the list names. A pinned skill keeps its version until a
// reload, and a skill that joins takes the version in force.
export async function joinListedSkills(log: Log, input: JoinListedSkillsInput): Promise<void> {
  if (input.inForce === null || input.list.length === 0) {
    return;
  }

  const pinned = await loadSkillPin(log, input.thread);

  if (pinned === null) {
    await recordSkillPin(log, {
      thread: input.thread,
      inForce: input.inForce,
      list: input.list,
    });

    return;
  }

  const plan = planSkillJoin({ pinned, inForce: input.inForce, list: input.list });

  if (plan.changes.length === 0) {
    return;
  }

  await recordSkillReload(log, { thread: input.thread, inForce: input.inForce, plan });
}
