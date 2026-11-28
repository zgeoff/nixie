import type { DefinitionsInForce } from '@heynixie/definitions';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolRun } from '@heynixie/tools';

// The skills a run's tools may use. A job run and a worker run carry their own list. The
// conversation's list is the definitions', and every other run has none.
export function readRunSkillList(
  run: ToolRun,
  inForce: Pick<DefinitionsInForce, 'conversationSkills'> | null,
): readonly string[] {
  if (run.skills !== undefined) {
    return run.skills;
  }

  return run.thread === conversationTaskID ? (inForce?.conversationSkills ?? []) : [];
}
